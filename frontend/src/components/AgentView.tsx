"use client";

import * as React from "react";
import { useTranslation } from "react-i18next";
import { Mail, Users, Calendar, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SimplePrivateAvatar } from "@/components/ui/private-avatar";
import { TicketsDataTable } from "@/components/datatable/TicketsDataTable";
import type { TicketEmail } from "@/components/datatable/TicketsDataTable";

type AgentGroup = {
  id: number;
  name: string;
  description: string | null;
};

type AgentEmployee = {
  id: number;
  name: string;
  avatar_url: string | null;
  email: string | null;
  disabled: boolean;
  created_at: string;
};

export type AgentViewProps = {
  employee: AgentEmployee;
  groups: AgentGroup[];
  tickets: TicketEmail[];
};

export function AgentView({ employee, groups, tickets }: AgentViewProps) {
  const { t } = useTranslation("common");

  const activeTickets = tickets.filter((t) => t.status !== "resolved");
  const resolvedTickets = tickets.filter((t) => t.status === "resolved");

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1"
        onClick={() => window.history.back()}
      >
        <ArrowLeft className="h-4 w-4" />
        {t("back")}
      </Button>

      {/* Agent Profile Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-6">
            <SimplePrivateAvatar
              src={employee.avatar_url}
              name={employee.name}
              className="h-20 w-20"
              fallbackClassName="text-2xl bg-primary text-primary-foreground"
            />
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold">{employee.name}</h1>
                {employee.disabled && (
                  <Badge variant="secondary">{t("disabled")}</Badge>
                )}
              </div>

              {employee.email && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>{employee.email}</span>
                </div>
              )}

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>
                  {t("agentView.memberSince")}{" "}
                  {new Date(employee.created_at).toLocaleDateString()}
                </span>
              </div>

              {/* Stats summary */}
              <div className="flex gap-4 pt-2">
                <div className="text-center">
                  <div className="text-2xl font-bold">{activeTickets.length}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("agentView.activeTickets")}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{resolvedTickets.length}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("agentView.resolvedTickets")}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{groups.length}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("agentView.groups")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Groups Section */}
      {groups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              {t("agentView.groups")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {groups.map((group) => (
                <Badge key={group.id} variant="outline" className="px-3 py-1">
                  <span className="font-medium">{group.name}</span>
                  {group.description && (
                    <span className="ml-2 text-muted-foreground">
                      — {group.description}
                    </span>
                  )}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assigned Tickets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("agentView.assignedTickets")}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({tickets.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t("agentView.noTickets")}
            </p>
          ) : (
            <TicketsDataTable
              data={tickets}
              showAssignedColumn={false}
              tableId={`agent-${employee.id}`}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
