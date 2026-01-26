
import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft, LayoutDashboard, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function RegistrationBlocked() {
  const { t } = useTranslation(['auth', 'common']);

  return (
    <div className="w-full max-w-md">
      <Card className="shadow-lg border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/10">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/20 text-amber-600 flex items-center justify-center">
            <AlertCircle className="h-8 w-8" />
          </div>
          <CardTitle className="text-xl text-amber-800 dark:text-amber-500">
            {t('auth:register.blocked.title', 'Account Already Registered')}
          </CardTitle>
          <CardDescription className="text-base text-amber-700 dark:text-amber-400">
            {t('auth:register.blocked.description', 'You are already a member of a workspace. Multiple workspaces per email are not currently supported.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button 
            className="w-full" 
            size="lg"
            onClick={() => window.location.href = '/dashboard'}
          >
            <LayoutDashboard className="mr-2 h-4 w-4" />
            {t('auth:register.blocked.goToDashboard', 'Go to Dashboard')}
          </Button>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-amber-200/50 dark:border-amber-800/50" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-amber-50 dark:bg-gray-950 px-2 text-muted-foreground">
                {t('common:or')}
              </span>
            </div>
          </div>

          <form action="/api/auth/signout" method="post">
             <Button variant="outline" className="w-full bg-background/50" type="submit">
               <LogOut className="mr-2 h-4 w-4" />
               {t('auth:signOut', 'Sign Out')}
             </Button>
          </form>
        </CardContent>
      </Card>
      
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {t('auth:register.blocked.hint', 'To create a new workspace, please sign out and use a different email address.')}
      </p>
    </div>
  );
}
