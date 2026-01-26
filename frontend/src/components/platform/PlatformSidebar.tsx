// src/components/platform/PlatformSidebar.tsx
"use client"

import * as React from "react"
import { useTranslation } from 'react-i18next'
import {
  Shield,
  Building2,
  CreditCard,
  BarChart3,
  Users,
  LayoutDashboard,
  LogOut,
  ArrowLeft,
  Bell,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu"
import { ChevronsUpDown } from "lucide-react"
import { actions } from "astro:actions"
import { NotificationBell } from "./NotificationBell"

type PlatformUser = {
  email: string;
}

type Props = React.ComponentProps<typeof Sidebar> & {
  user: PlatformUser;
  currentPath?: string;
  hasClientLink?: boolean;
  clientName?: string;
  initialUnreadCount?: number;
}

export function PlatformSidebar({ 
  user,
  currentPath = "/platform/dashboard",
  hasClientLink = false,
  clientName,
  initialUnreadCount = 0,
  ...props 
}: Props) {
  const { t } = useTranslation('platform')
  const [isLoggingOut, setIsLoggingOut] = React.useState(false)

  const navItems = [
    {
      title: t('sidebar.overview'),
      url: "/platform/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: t('sidebar.companies'),
      url: "/platform/clients",
      icon: Building2,
    },
    {
      title: t('sidebar.billing'),
      url: "/platform/billing",
      icon: CreditCard,
    },
    {
      title: t('sidebar.analytics'),
      url: "/platform/analytics",
      icon: BarChart3,
    },
    {
      title: t('users.platformAdmins'),
      url: "/platform/admins",
      icon: Users,
    },
    {
      title: t('sidebar.notifications'),
      url: "/platform/notifications",
      icon: Bell,
    },
  ]

  const getInitials = (email: string) => {
    const parts = email.split('@')[0].split(/[._-]/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return email.substring(0, 2).toUpperCase()
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      const result = await actions.signOut()
      if (result?.data?.success) {
        window.location.href = '/'
      }
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center justify-between w-full">
              <SidebarMenuButton size="lg" className="pointer-events-none flex-1">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Shield className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{t('shell.platformAdmin')}</span>
                  <span className="truncate text-xs text-muted-foreground">{t('shell.managementConsole')}</span>
                </div>
              </SidebarMenuButton>
              <div className="group-data-[collapsible=icon]:hidden">
                <NotificationBell initialUnreadCount={initialUnreadCount} />
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('shell.navigation')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild
                    isActive={currentPath === item.url || currentPath.startsWith(item.url + '/')}
                  >
                    <a href={item.url}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {hasClientLink && (
          <SidebarGroup>
            <SidebarGroupLabel>{t('shell.quickAccess')}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <a href="/dashboard">
                      <ArrowLeft className="size-4" />
                      <span>{t('sidebar.backToApp', { name: clientName || t('shell.client') })}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
                      {getInitials(user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{t('shell.platformAdmin')}</span>
                    <span className="truncate text-xs">{user.email}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="right"
                align="end"
                sideOffset={4}
              >
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
                      {getInitials(user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{t('shell.platformAdmin')}</span>
                    <span className="truncate text-xs">{user.email}</span>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                >
                  <LogOut className="size-4 mr-2" />
                  {isLoggingOut ? t('shell.loggingOut') : t('shell.logOut')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
