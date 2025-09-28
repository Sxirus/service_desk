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

type Props = React.ComponentProps<typeof Sidebar> & {
  userOverride?: UserOverride
  firstTeamOverride?: FirstTeamOverride
  isAdmin?: boolean
  currentPath?: string
}

export function AppSidebar({ 
  userOverride, 
  firstTeamOverride, 
  isAdmin = false,
  currentPath = "/",
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
    const baseItems = [
      {
        title: "Service Desk",
        url: "/",
        icon: Home,
        isActive: currentPath === "/" || currentPath === "/dashboard",
        items: [
          { title: "Dashboard", url: "/dashboard" },
        ],
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
            title: "Users", 
            url: "/manage/users",
          },
          { 
            title: "Company", 
            url: "/manage/client",
          },
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