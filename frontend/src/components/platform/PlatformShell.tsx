// src/components/platform/PlatformShell.tsx

import * as React from "react";
import { I18nProvider } from "@/i18n/I18nProvider";
import { PlatformSidebar } from "./PlatformSidebar";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export type PlatformUser = {
  email: string;
};

type Props = {
  children?: React.ReactNode;
  user: PlatformUser;
  crumbParentLabel?: string;
  crumbParentHref?: string;
  crumbCurrent?: string;
  currentPath?: string;
  hasClientLink?: boolean;
  clientName?: string;
};

export default function PlatformShell({
  children,
  user,
  crumbParentLabel = "Platform",
  crumbParentHref = "/platform/dashboard",
  crumbCurrent = "Dashboard",
  currentPath,
  hasClientLink = false,
  clientName,
}: Props) {
  const [detectedPath, setDetectedPath] = React.useState("");

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setDetectedPath(window.location.pathname);
    }
  }, []);

  const finalPath = currentPath || detectedPath;

  return (
    <I18nProvider>
      <SidebarProvider>
        <PlatformSidebar
          user={user}
          currentPath={finalPath}
          hasClientLink={hasClientLink}
          clientName={clientName}
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
          </header>

          <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
            <div className="bg-muted/50 flex-1 rounded-xl p-4 pt-0 md:min-h-min">
              {children}
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </I18nProvider>
  );
}
