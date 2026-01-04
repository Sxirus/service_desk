"use client"

import * as React from "react"
import {
  AudioWaveform,
  BookOpen,
  Bot,
  Command,
  Frame,
  GalleryVerticalEnd,
  Map,
  PieChart,
  Settings2,
  SquareTerminal,
  Users,
  Home,
  Inbox,
  Shield,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"

type UserOverride = {
  name?: string | null
  email?: string | null
  avatar?: string | null
}

type FirstTeamOverride = {
  name: string
  plan?: string | null
}

type InboxType = {
  id: number
  name: string
  description?: string | null
}

type Props = React.ComponentProps<typeof Sidebar> & {
  userOverride?: UserOverride
  firstTeamOverride?: FirstTeamOverride
  isAdmin?: boolean
  isPlatformAdmin?: boolean
  currentPath?: string
  accessibleInboxes?: InboxType[]
  employeeId?: number
  clientId?: number
  subscriptionTier?: string
}

export function AppSidebar({ 
  userOverride, 
  firstTeamOverride, 
  isAdmin = false,
  isPlatformAdmin = false,
  currentPath = "/",
  accessibleInboxes = [],
  employeeId = 0,
  clientId = 0,
  subscriptionTier = "free",
  ...props 
}: Props) {
  const { t } = useTranslation('common');
  
  // Userdaten befüllen
  const userName = userOverride?.name && userOverride.name.trim() 
    ? userOverride.name 
    : "User"
  const user = {
    name: userName,
    email: userOverride?.email ?? "user@example.com",
    avatar: userOverride?.avatar ?? "",
    initials: getInitials(userName),
  }

  function getInitials(name: string) {
    if (!name) return "U";
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
  }

  // Navigation Items basierend auf Rolle und aktueller Seite
  const getNavItems = () => {
    // Build inbox items array with Dashboard and accessible inboxes
    const inboxItems = [
      { title: t('sidebar.yourAssignedTickets'), url: "/dashboard" },
      ...accessibleInboxes.map(inbox => ({
        title: inbox.name,
        url: `/inboxes/${inbox.id}`,
        inboxId: inbox.id
      }))
    ];

    const baseItems = [
      {
        title: t('sidebar.inbox'),
        url: "/",
        icon: Home,
        isActive: currentPath === "/" || currentPath === "/dashboard" || currentPath.startsWith("/inboxes") || currentPath.startsWith("/tickets"),
        items: inboxItems,
      },
    ];

    // Administration nur für Admins
    if (isAdmin) {
      baseItems.push({
        title: t('sidebar.administration'),
        url: "/manage",
        icon: Bot,
        isActive: currentPath.startsWith("/manage"),
        items: [
          {
            title: t('sidebar.generalSettings'),
            url: "/manage/settings"
          },
          { 
            title: t('sidebar.usersGroups'), 
            url: "/manage/users",
          },
          { 
            title: t('sidebar.billingData'), 
            url: "/manage/client",
          },
          { 
            title: t('sidebar.integrations'), 
            url: "/manage/shopify",
          },
          {
            title: t('sidebar.macros'),
            url: "/manage/macro"
          },
          {
            title: t('sidebar.analytics'),
            url: "/manage/analytics"
          },
          {
            title: t('sidebar.inboxes'),
            url: "/manage/inboxes"
          },
          {
            title: t('sidebar.subscription'),
            url: "/manage/subscription"
          }
        ],
      });
    }

    // Platform Management for platform admins
    if (isPlatformAdmin) {
      baseItems.push({
        title: t('sidebar.platform'),
        url: "/platform",
        icon: Shield,
        isActive: currentPath.startsWith("/platform"),
        items: [
          {
            title: t('sidebar.dashboard'),
            url: "/platform/dashboard"
          },
          {
            title: t('sidebar.clients'),
            url: "/platform/clients"
          },
          {
            title: t('sidebar.billing'),
            url: "/platform/billing"
          },
          {
            title: t('sidebar.analytics'),
            url: "/platform/analytics"
          },
          {
            title: t('sidebar.platformAdmins'),
            url: "/platform/admins"
          }
        ],
      });
    }

    return baseItems;
  };

  // Ersten Team-Eintrag überschreiben
  const teams = [
    {
      name: firstTeamOverride?.name ?? "Acme Inc",
      logo: GalleryVerticalEnd,
      plan: firstTeamOverride?.plan ?? "Enterprise",
    }
  ];

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={getNavItems()} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser 
          user={user} 
          employeeId={employeeId}
          clientId={clientId}
          subscriptionTier={subscriptionTier}
          isPlatformAdmin={isPlatformAdmin}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}