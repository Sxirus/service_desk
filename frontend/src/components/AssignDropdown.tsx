import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Users, User, Search, X } from "lucide-react";

/**
 * Types
 */
interface GroupMember {
  employee_id: string;
  name: string;
}

interface GroupWithMembers {
  id: number;
  name: string;
  description: string | null;
  members: GroupMember[];
}

interface Employee {
  title: string;
  text: string;
}

interface AssignDropdownProps {
  groups: GroupWithMembers[];
  employees: Employee[];
  assigned: string | null;
  eventName: string;
  customerId: string;
  placeholder?: string;
}

/**
 * AssignDropdown
 * 
 * Dropdown for assigning a ticket to a group or an individual agent.
 * Groups are displayed as collapsible upper-level items, with their
 * member agents nested underneath. Agents that don't belong to any
 * group are listed in a separate section at the bottom.
 * 
 * Assignment logic is unchanged: dispatches a CustomEvent with the
 * same `employee:id`, `group:id`, or `unassign:true` payload.
 */
export function AssignDropdown({
  groups,
  employees,
  assigned,
  eventName,
  customerId,
  placeholder,
}: AssignDropdownProps) {
  const { t } = useTranslation("dashboard");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when popover opens
  useEffect(() => {
    if (open) {
      // Small delay to wait for popover to render
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setSearch("");
    }
  }, [open]);

  // Normalize for search
  const norm = (s: string) => (s || "").toString().trim().toLowerCase();

  // Determine which employees are in groups and which are ungrouped
  const { groupedEmployeeIds, ungroupedEmployees } = useMemo(() => {
    const ids = new Set<string>();
    groups.forEach((g) => {
      g.members.forEach((m) => {
        ids.add(m.employee_id);
      });
    });

    const ungrouped = employees.filter((emp) => !ids.has(emp.text));
    return { groupedEmployeeIds: ids, ungroupedEmployees: ungrouped };
  }, [groups, employees]);

  // Filter results based on search query
  const filteredGroups = useMemo(() => {
    const q = norm(search);
    if (!q) return groups;

    return groups
      .map((group) => {
        const groupMatches = norm(group.name).includes(q);
        const matchingMembers = group.members.filter((m) =>
          norm(m.name).includes(q)
        );
        // Show group if group name matches OR any member matches
        if (groupMatches || matchingMembers.length > 0) {
          return {
            ...group,
            // If searching and only members match, show only matching members
            members: groupMatches ? group.members : matchingMembers,
          };
        }
        return null;
      })
      .filter(Boolean) as GroupWithMembers[];
  }, [groups, search]);

  const filteredUngrouped = useMemo(() => {
    const q = norm(search);
    if (!q) return ungroupedEmployees;
    return ungroupedEmployees.filter((emp) => norm(emp.title).includes(q));
  }, [ungroupedEmployees, search]);

  // Auto-expand groups that have matching members when searching
  useEffect(() => {
    if (search) {
      const matchingGroupIds = new Set<number>();
      filteredGroups.forEach((g) => matchingGroupIds.add(g.id));
      setExpandedGroups(matchingGroupIds);
    }
  }, [search, filteredGroups]);

  const toggleGroup = useCallback((groupId: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // Dispatch assignment event
  const selectEmployee = useCallback(
    (employeeId: string) => {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: { text: `employee:${employeeId}` },
        })
      );
      setOpen(false);
      setSearch("");
    },
    [eventName]
  );

  const selectGroup = useCallback(
    (groupId: number) => {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: { text: `group:${groupId}` },
        })
      );
      setOpen(false);
      setSearch("");
    },
    [eventName]
  );

  const handleUnassign = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: { text: "unassign:true" },
        })
      );
    },
    [eventName]
  );

  const hasResults = filteredGroups.length > 0 || filteredUngrouped.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={t("tickets.assignTo")}
        >
          <span className={assigned ? "text-foreground" : "text-muted-foreground"}>
            {assigned || placeholder || t("tickets.searchEmployeeOrGroup")}
          </span>
          <div className="flex items-center gap-1">
            {assigned && (
              <span
                role="button"
                tabIndex={0}
                onClick={handleUnassign}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    handleUnassign(e as unknown as React.MouseEvent);
                  }
                }}
                className="text-muted-foreground hover:text-destructive transition-colors p-0.5 rounded-sm hover:bg-muted"
                title={t("tickets.removeAssignment")}
                aria-label={t("tickets.removeAssignment")}
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        sideOffset={4}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder={placeholder || t("tickets.searchEmployeeOrGroup")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Scrollable list */}
        <div className="max-h-64 overflow-y-auto py-1">
          {!hasResults && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              {t("tickets.noResults")}
            </div>
          )}

          {/* Groups with nested agents */}
          {filteredGroups.map((group) => (
            <Collapsible
              key={group.id}
              open={expandedGroups.has(group.id)}
              onOpenChange={() => toggleGroup(group.id)}
            >
              <div className="flex items-center">
                {/* Chevron toggle for expanding/collapsing */}
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="p-1.5 ml-1 text-muted-foreground hover:text-foreground transition-colors rounded-sm hover:bg-muted"
                    aria-label={expandedGroups.has(group.id) ? "Collapse" : "Expand"}
                  >
                    {expandedGroups.has(group.id) ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                </CollapsibleTrigger>

                {/* Group item - clicking assigns the group */}
                <button
                  type="button"
                  className="flex-1 flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm cursor-pointer transition-colors text-left"
                  onClick={() => selectGroup(group.id)}
                  title={group.description || group.name}
                >
                  <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-medium truncate">{group.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto shrink-0">
                    {group.members.length}
                  </span>
                </button>
              </div>

              {/* Nested member agents */}
              <CollapsibleContent>
                <div className="ml-6 border-l border-border">
                  {group.members.map((member) => (
                    <button
                      key={member.employee_id}
                      type="button"
                      className="w-full flex items-center gap-2 pl-3 pr-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors text-left"
                      onClick={() => selectEmployee(member.employee_id)}
                    >
                      <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{member.name}</span>
                    </button>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}

          {/* Separator between groups and ungrouped agents */}
          {filteredGroups.length > 0 && filteredUngrouped.length > 0 && (
            <div className="my-1 border-t border-border" />
          )}

          {/* Ungrouped agents */}
          {filteredUngrouped.length > 0 && (
            <div>
              {filteredUngrouped.length > 0 && groups.length > 0 && (
                <div className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("tickets.otherAgents")}
                </div>
              )}
              {filteredUngrouped.map((emp) => (
                <button
                  key={emp.text}
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors text-left"
                  onClick={() => selectEmployee(emp.text)}
                >
                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{emp.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
