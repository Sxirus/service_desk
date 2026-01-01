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
} from "lucide-react"

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
  currentPath?: string
  accessibleInboxes?: InboxType[]
}

export function AppSidebar({ 
  userOverride, 
  firstTeamOverride, 
  isAdmin = false,
  currentPath = "/",
  accessibleInboxes = [],
  ...props 
}: Props) {
  // Userdaten befüllen
  const user = {
    name: userOverride?.name ?? "User",
    email: userOverride?.email ?? "user@example.com",
    avatar: userOverride?.avatar ?? "",
    initials: getInitials(userOverride?.name ?? "User"),
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
      { title: "Your Assigned Tickets", url: "/dashboard" },
      ...accessibleInboxes.map(inbox => ({
        title: inbox.name,
        url: `/inboxes/${inbox.id}`,
        inboxId: inbox.id
      }))
    ];

    const baseItems = [
      {
        title: "Inbox",
        url: "/",
        icon: Home,
        isActive: currentPath === "/" || currentPath === "/dashboard" || currentPath.startsWith("/inboxes"),
        items: inboxItems,
      },
    ];

    // Administration nur für Admins
    if (isAdmin) {
      baseItems.push({
        title: "Administration",
        url: "/manage",
        icon: Bot,
        isActive: currentPath.startsWith("/manage"),
        items: [
          {
            title: "General Settings",
            url: "/manage/settings"
          },
          { 
            title: "Users & Groups", 
            url: "/manage/users",
          },
          { 
            title: "Billing data", 
            url: "/manage/client",
          },
          { 
            title: "Integrations", 
            url: "/manage/shopify",
          },
          {
            title: "Macros",
            url: "/manage/macro"
          },
          {
            title: "Analytics",
            url: "/manage/analytics"
          },
          {
            title: "Inboxes",
            url: "/manage/inboxes"
          },
          {
            title: "Subscription",
            url: "/manage/subscription"
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
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}