import * as React from "react";
import { useTranslation } from "react-i18next";
import { Search, Users, UserCircle, Mail, Inbox, Loader2 } from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { useSearch } from "@/hooks/useSearch";

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const { t } = useTranslation("common");
  const [query, setQuery] = React.useState("");
  const { results, isLoading } = useSearch(query);

  // Reset query when dialog closes
  React.useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const hasResults =
    results.customers.length > 0 ||
    results.emails.length > 0 ||
    results.employees.length > 0 ||
    results.tickets.length > 0;

  function navigate(href: string) {
    onOpenChange(false);
    window.location.href = href;
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={t("globalSearch.placeholder")}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && query.trim().length >= 2 && !hasResults && (
          <CommandEmpty>{t("globalSearch.noResults")}</CommandEmpty>
        )}

        {results.customers.length > 0 && (
          <CommandGroup heading={t("globalSearch.customers")}>
            {results.customers.map((customer) => (
              <CommandItem
                key={`customer-${customer.id}`}
                value={`customer-${customer.name}`}
                onSelect={() => navigate(`/tickets/${customer.id}`)}
              >
                <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{customer.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results.emails.length > 0 && (
          <>
            {results.customers.length > 0 && <CommandSeparator />}
            <CommandGroup heading={t("globalSearch.emailAddresses")}>
              {results.emails.map((email) => (
                <CommandItem
                  key={`email-${email.email_address}`}
                  value={`email-${email.email_address}`}
                  onSelect={() => navigate(`/tickets/${email.customer_id}`)}
                >
                  <Mail className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{email.email_address}</span>
                    <span className="text-xs text-muted-foreground">
                      {email.customer_name}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {results.employees.length > 0 && (
          <>
            {(results.customers.length > 0 || results.emails.length > 0) && (
              <CommandSeparator />
            )}
            <CommandGroup heading={t("globalSearch.agents")}>
              {results.employees.map((employee) => (
                <CommandItem
                  key={`employee-${employee.id}`}
                  value={`employee-${employee.name}`}
                  onSelect={() => navigate(`/agents/${employee.id}`)}
                >
                  <UserCircle className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{employee.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {results.tickets.length > 0 && (
          <>
            {(results.customers.length > 0 ||
              results.emails.length > 0 ||
              results.employees.length > 0) && <CommandSeparator />}
            <CommandGroup heading={t("globalSearch.tickets")}>
              {results.tickets.map((ticket) => (
                <CommandItem
                  key={`ticket-${ticket.id}`}
                  value={`ticket-${ticket.id}-${ticket.subject}`}
                  onSelect={() => navigate(`/tickets/${ticket.customer_id}`)}
                >
                  <Inbox className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">
                      {t("globalSearch.ticketId", { id: ticket.id })}
                    </span>
                    <span className="line-clamp-1">{ticket.subject}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
