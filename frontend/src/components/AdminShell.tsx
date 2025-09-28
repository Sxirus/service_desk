// src/components/AdminShell.tsx
import * as React from "react";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export type ShellUser = {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
};

type Props = {
  children?: React.ReactNode;
  user?: ShellUser;
  firstTeam?: { name: string; plan?: string | null };
  crumbParentLabel?: string;
  crumbParentHref?: string;
  crumbCurrent?: string;
  isAdmin?: boolean;
  currentPath?: string;
};

export default function AdminShell({
  children,
  user,
  firstTeam,
  crumbParentLabel = "Building Your Application",
  crumbParentHref = "#",
  crumbCurrent = "Data Fetching",
  isAdmin = false,
  currentPath,
}: Props) {
  // Aktueller Pfad aus dem Browser ermitteln, falls nicht übergeben
  const [detectedPath, setDetectedPath] = React.useState("");

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setDetectedPath(window.location.pathname);
    }
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
        currentPath={finalPath}
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
          <div className="bg-muted/50 flex-1 rounded-xl p-4 md:min-h-min">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}