import {
  BadgeCheck,
  ChevronsUpDown,
  LogOut,
  Sparkles,
  Shield,
  Globe,
  Check,
} from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useAvatarUrl } from "@/hooks/use-avatar"
import { supportedLanguages, type SupportedLanguage, setLanguageCookie } from "@/i18n/config"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { AccountSettingsDialog } from "@/components/AccountSettingsDialog"

import { actions } from "astro:actions"

export function NavUser({
  user,
  employeeId,
  clientId,
  subscriptionTier = "free",
  isPlatformAdmin = false,
}: {
  user: {
    name: string
    email: string
    avatar: string
    initials: string
  }
  employeeId: number
  clientId: number
  subscriptionTier?: string
  isPlatformAdmin?: boolean
}) {
  const { t, i18n } = useTranslation(['common', 'auth', 'manage'])
  const { isMobile } = useSidebar()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  
  // Resolve avatar URL from private storage path
  const { url: resolvedAvatarUrl } = useAvatarUrl(user.avatar)

  console.log("[NavUser] subscriptionTier:", subscriptionTier)
  const isPro = subscriptionTier === "paid"

  const handleLanguageChange = (languageCode: SupportedLanguage) => {
    localStorage.setItem('i18nextLng', languageCode)
    setLanguageCookie(languageCode)
    i18n.changeLanguage(languageCode)
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    
    try {
      const result = await actions.signOut()
      
      if (!result?.data?.success) {
        console.error('Logout failed:', result?.data?.message)
        alert(result?.data?.message ?? t('errors.generic'))
        return
      }
      
      // Erfolgreiche Abmeldung - zur Login-Seite weiterleiten
      window.location.href = '/'
      
    } catch (err) {
      console.error('Logout error:', err)
      alert(t('errors.generic'))
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={resolvedAvatarUrl || undefined} alt={user.name} />
                  <AvatarFallback className="rounded-lg">{user.initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={resolvedAvatarUrl || undefined} alt={user.name} />
                    <AvatarFallback className="rounded-lg">{user.initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{user.name}</span>
                    <span className="truncate text-xs">{user.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {!isPro && (
                <>
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => window.location.href = '/manage/subscription'}>
                      <Sparkles />
                      {t('manage:subscription.upgrade')}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setShowSettings(true)}>
                  <BadgeCheck />
                  {t('auth:accountSettings.title')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              {isPlatformAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => window.location.href = '/platform/dashboard'}>
                      <Shield />
                      {t('platform:title', { ns: 'platform' })}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Globe className="mr-2 h-4 w-4" />
                    {t('common:language')}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                      {supportedLanguages.map((language) => (
                        <DropdownMenuItem
                          key={language.code}
                          onClick={() => handleLanguageChange(language.code as SupportedLanguage)}
                        >
                          <span className="mr-2">{language.flag}</span>
                          {language.name}
                          {i18n.language === language.code && (
                            <Check className="ml-auto h-4 w-4" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="text-red-600 focus:text-red-600 focus:bg-red-50"
              >
                <LogOut />
                {isLoggingOut ? t('auth:logout.message') : t('auth:logout.button')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <AccountSettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        user={user}
        employeeId={employeeId}
        clientId={clientId}
      />
    </>
  )
}