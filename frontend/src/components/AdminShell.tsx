// src/components/AdminShell.tsx
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/GlobalSearch";
import { apiClient } from "@/utils/api";

export type ShellUser = {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
};

type InboxType = {
  id: number;
  name: string;
  description?: string | null;
};

type Props = {
  children?: React.ReactNode;
  user?: ShellUser;
  firstTeam?: { name: string; plan?: string | null };
  crumbParentLabel?: string;
  crumbParentHref?: string;
  crumbCurrent?: string;
  isAdmin?: boolean;
  isPlatformAdmin?: boolean;
  currentPath?: string;
  employeeId?: number;
  clientId?: number;
  subscriptionTier?: string;
};

export default function AdminShell({
  children,
  user,
  firstTeam,
  crumbParentLabel = "Building Your Application",
  crumbParentHref = "#",
  crumbCurrent = "Data Fetching",
  isAdmin = false,
  isPlatformAdmin = false,
  currentPath,
  employeeId = 0,
  clientId = 0,
  subscriptionTier = "free",
}: Props) {
  const { t } = useTranslation("common");
  const [searchOpen, setSearchOpen] = React.useState(false);

  // Ctrl+K / Cmd+K keyboard shortcut to open search
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Aktueller Pfad aus dem Browser ermitteln, falls nicht übergeben
  const [detectedPath, setDetectedPath] = React.useState("");
  const [accessibleInboxes, setAccessibleInboxes] = React.useState<InboxType[]>([]);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setDetectedPath(window.location.pathname);
    }
  }, []);

  // Fetch accessible inboxes on mount
  React.useEffect(() => {
    const fetchInboxes = async () => {
      try {
        const response = await apiClient.get('/inboxes/getAccessibleInboxes');
        if (response.success && response.data) {
          setAccessibleInboxes(response.data);
        }
      } catch (error) {
        console.error('Failed to load accessible inboxes:', error);
      }
    };

    fetchInboxes();
  }, []);

  // Verwende den übergebenen Pfad oder den erkannten Pfad
  const finalPath = currentPath || detectedPath;

  return (
    <SidebarProvider>
      <AppSidebar
        userOverride={{
          name: user?.name ?? null,
          email: user?.email ?? null,
          avatar: user?.avatarUrl ?? null,
        }}
        firstTeamOverride={firstTeam}
        isAdmin={isAdmin}
        isPlatformAdmin={isPlatformAdmin}
        currentPath={finalPath}
        accessibleInboxes={accessibleInboxes}
        employeeId={employeeId}
        clientId={clientId}
        subscriptionTier={subscriptionTier}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href={crumbParentHref}>{crumbParentLabel}</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{crumbCurrent}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="ml-auto flex items-center gap-2 px-4">
            <Button
              variant="outline"
              size="sm"
              className="relative h-8 w-full justify-start rounded-md bg-muted/50 text-sm font-normal text-muted-foreground shadow-none sm:w-64 sm:pr-12"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="mr-2 h-4 w-4" />
              {t("globalSearch.openSearch")}
              <kbd className="pointer-events-none absolute right-[0.3rem] top-[0.3rem] hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                <span className="text-xs">⌘</span>K
              </kbd>
            </Button>
          </div>
          <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="bg-muted/50 flex-1 rounded-xl p-4 pt-0 md:min-h-min">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}