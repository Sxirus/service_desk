import { ChevronRight, type LucideIcon } from "lucide-react"
import * as React from "react"
import { useTranslation } from 'react-i18next'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { apiClient } from "@/utils/api"

// Hook für lazy loading der Email-Counts
function useEmailCounts() {
  const [counts, setCounts] = React.useState<{ dashboard: number; inboxes: Record<string, number> } | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchCounts = async () => {
      try {
        const result = await apiClient.get('/inboxes/getCounts');
        console.log('[NavMain] Fetched counts:', result);
        if (result.success) {
          setCounts(result.data);
        }
      } catch (error) {
        // Silently fail - counts are optional UI enhancement
        console.error('[NavMain] Failed to fetch email counts:', error);
      } finally {
        setLoading(false);
      }
    };

    // Small delay to ensure auth is ready
    const timer = setTimeout(fetchCounts, 100);
    return () => clearTimeout(timer);
  }, []);

  return { counts, loading };
}

// Komponente für die Count-Anzeige
function EmailCount({ count, loading }: { count: number | undefined; loading: boolean }) {
  if (loading) {
    return (
      <span className="ml-auto text-xs text-muted-foreground/50 tabular-nums">
        ...
      </span>
    );
  }

  if (count === undefined) {
    return null;
  }

  return (
    <span className="ml-auto text-xs text-muted-foreground/60 tabular-nums shrink-0 mt-0.5">
      {count}
    </span>
  );
}

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: LucideIcon
    isActive?: boolean
    items?: {
      title: string
      url: string
      inboxId?: number
    }[]
  }[]
}) {
  const { t } = useTranslation('common');
  const { counts, loading } = useEmailCounts();

  // Funktion um den Count für ein Item zu bekommen
  const getCountForItem = (subItem: { title: string; url: string; inboxId?: number }) => {
    if (!counts) return undefined;
    
    if (subItem.url === '/dashboard') {
      return counts.dashboard ?? 0;
    }
    
    if (subItem.inboxId) {
      return counts.inboxes[subItem.inboxId] ?? 0;
    }
    
    return undefined;
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t('sidebar.platform')}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <Collapsible
            key={item.title}
            asChild
            defaultOpen={item.isActive}
            className="group/collapsible"
          >
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton tooltip={item.title}>
                  {item.icon && <item.icon />}
                  <span>{item.title}</span>
                  <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {item.items?.map((subItem) => (
                    <SidebarMenuSubItem key={subItem.title}>
                      <SidebarMenuSubButton asChild>
                        <a href={subItem.url} className="flex w-full items-start justify-between">
                          <span className="break-words">{subItem.title}</span>
                          <EmailCount 
                            count={getCountForItem(subItem)} 
                            loading={loading && (subItem.url === '/dashboard' || !!subItem.inboxId)} 
                          />
                        </a>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
