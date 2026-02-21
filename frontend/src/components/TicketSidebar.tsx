/**
 * TicketSidebar Component
 * 
 * Right sidebar for ticket detail view containing:
 * - Customer information
 * - Shopify orders (lazy loaded)
 * - Quick response macros
 * - Employee assignment
 * 
 * Features:
 * - Lazy loading for Shopify orders (loads only when visible)
 * - Accessible navigation and controls
 * - Error boundaries for failed sections
 * 
 * Note: Adapts types for legacy components (CustomerInfo, ShopifyOrders)
 * which expect numeric IDs instead of strings.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MacroSearch } from './macroSearch.jsx';
import { AssignDropdown } from './AssignDropdown';
import { ShopifyOrders } from './ShopifyOrders';
import { CustomerInfo } from './CustomerInfo';
import type { TicketSidebarProps } from '@/types/ticket.types';
import type { ShopifyClientData } from '@/types/shopify.types';
import { apiClient } from '@/utils/api';
import { toast } from 'sonner';

/**
 * Intersection Observer hook for lazy loading
 * 
 * @param elementRef - Ref to element to observe
 * @param options - IntersectionObserver options
 * @returns Whether the element is visible
 */
function useIntersectionObserver(
  elementRef: React.RefObject<HTMLElement | null>,
  options: IntersectionObserverInit = {}
): boolean {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isVisible) {
          setIsVisible(true);
          // Once visible, stop observing (we only need to load once)
          observer.disconnect();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '50px',
        ...options
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [elementRef, isVisible, options]);

  return isVisible;
}

/**
 * Card wrapper component for sidebar sections
 */
interface SidebarCardProps {
  title: string;
  children: React.ReactNode;
  id?: string;
}

const SidebarCard: React.FC<SidebarCardProps> = ({ title, children, id }) => {
  return (
    <section 
      id={id}
      className="rounded-lg border bg-card text-card-foreground shadow-sm"
      aria-labelledby={id ? `${id}-title` : undefined}
    >
      <div className="p-4 space-y-3">
        <h3 
          id={id ? `${id}-title` : undefined}
          className="font-semibold leading-none tracking-tight"
        >
          {title}
        </h3>
        {children}
      </div>
    </section>
  );
};

/**
 * Main TicketSidebar Component
 */
export const TicketSidebar: React.FC<TicketSidebarProps> = ({
  customer,
  emailAddress,
  shopifyConfig,
  clientData,
  macros,
  macroGroups,
  employees,
  assignedEmployeeName,
  macroContext
}) => {
  const { t } = useTranslation('dashboard');
  const shopifyRef = useRef<HTMLDivElement>(null);
  const isShopifyVisible = useIntersectionObserver(shopifyRef, {
    threshold: 0.1,
    rootMargin: '100px'
  });

  const [groups, setGroups] = useState<Array<{id: number; name: string; description: string | null; members: Array<{employee_id: string; name: string}>}>>([]);
  const [assignedName, setAssignedName] = useState<string | null>(null);

  // Load groups with members on mount
  useEffect(() => {
    const loadGroups = async () => {
      try {
        const response = await apiClient.get('/groups/getGroupsWithMembers');
        if (response.success) {
          setGroups(response.data || []);
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[TicketSidebar] Failed to load groups:', error);
        }
      }
    };
    
    loadGroups();
  }, []);

  // Determine what is currently assigned
  useEffect(() => {
    // Priority: group_id > employee_id
    if (customer.group_id) {
      if (groups.length > 0) {
        const assignedGroup = groups.find(g => g.id === customer.group_id);
        if (assignedGroup) {
          setAssignedName(`👥 ${assignedGroup.name}`);
        }
      }
    } else if (assignedEmployeeName) {
      setAssignedName(`👤 ${assignedEmployeeName}`);
    } else {
      setAssignedName(null);
    }
  }, [groups, customer.group_id, assignedEmployeeName]);

  /**
   * Adapt types for legacy components that expect numeric IDs
   * TODO: Update CustomerInfo and ShopifyOrders to use string IDs
   */
  const legacyCustomer = {
    id: parseInt(customer.id) || 0,
    name: customer.name
  };

  const legacyClientData: ShopifyClientData = {
    id: parseInt(clientData.id) || 0,
    name: clientData.name,
    shopify_store_url: clientData.shopify_store_url,
    shopify_access_token: clientData.shopify_access_token,
    shopify_connected: clientData.shopify_connected,
    shopify_scope: clientData.shopify_scope
  };

  /**
   * Handle assignment event from child component (employee or group)
   */
  useEffect(() => {
    const handleAssignment = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const assignmentValue = customEvent?.detail?.text;

      if (assignmentValue === undefined || assignmentValue === null) {
        return;
      }

      // Parse the assignment value to determine type
      const [type, id] = assignmentValue.split(':');
      
      if (type === 'employee') {
        try {
          const response = await apiClient.post('/client/assignEmployee', {
            employee_id: id,
            customer_id: customer.id
          });
          
          if (response.success) {
            // Update local state
            // Try flexible comparison (string/number) against employees list
            const assignedEmp = employees.find(e => String(e.text) === String(id));
            let assignedEmpName = assignedEmp?.title;

            // Fallback: try to resolve name from groups' members (if present)
            if (!assignedEmpName && Array.isArray(groups)) {
              for (const g of groups) {
                if (!g || !g.members) continue;
                const member = g.members.find(m => String(m.employee_id) === String(id));
                if (member) {
                  assignedEmpName = member.name;
                  break;
                }
              }
            }

            if (assignedEmpName) {
              setAssignedName(`👤 ${assignedEmpName}`);
              toast.success(t('tickets.assignedToEmployee', { name: assignedEmpName }));
            } else {
              // Generic success message if name couldn't be resolved immediately
              toast.success(t('tickets.employeeAssignedSuccess'));
            }
          } else {
            if (import.meta.env.DEV) {
              console.error('[TicketSidebar] Employee assignment failed:', response.error);
            }
            toast.error(t('tickets.failedToAssignEmployee'));
          }
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error('[TicketSidebar] Failed to assign employee:', error);
          }
          toast.error(t('tickets.failedToAssignEmployee'));
        }
      } else if (type === 'group') {
        try {
          const response = await apiClient.post('/client/assignGroup', {
            group_id: id,
            customer_id: customer.id
          });
          
          if (response.success) {
            // Update local state
            const assignedGroup = groups.find(g => g.id === parseInt(id));
            if (assignedGroup) {
              setAssignedName(`👥 ${assignedGroup.name}`);
            }
            toast.success(assignedGroup ? t('tickets.assignedToGroup', { name: assignedGroup.name }) : t('tickets.groupAssignedSuccess'));
          } else {
            if (import.meta.env.DEV) {
              console.error('[TicketSidebar] Group assignment failed:', response.error);
            }
            toast.error(t('tickets.failedToAssignGroup'));
          }
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error('[TicketSidebar] Failed to assign group:', error);
          }
          toast.error(t('tickets.failedToAssignGroup'));
        }
      } else if (type === 'unassign') {
        try {
          const response = await apiClient.post('/client/unassign', {
            customer_id: customer.id
          });
          
          if (response.success) {
            setAssignedName(null);
            toast.success(t('tickets.assignmentRemoved'));
          } else {
            if (import.meta.env.DEV) {
              console.error('[TicketSidebar] Unassign failed:', response.error);
            }
            toast.error(t('tickets.failedToRemoveAssignment'));
          }
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error('[TicketSidebar] Failed to unassign:', error);
          }
          toast.error(t('tickets.failedToRemoveAssignment'));
        }
      }
    };

    window.addEventListener('Zuweisung', handleAssignment);
    return () => window.removeEventListener('Zuweisung', handleAssignment);
  }, [customer.id, groups, employees]);

  return (
    <aside 
      className="w-88 shrink-0 border-l bg-muted/30 flex flex-col overflow-hidden"
      role="complementary"
      aria-label={t('tickets.ticketInfoSidebar')}
    >
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* Customer Information */}
          <CustomerInfo
            customer={legacyCustomer}
            emailAddress={emailAddress}
            shopifyConfig={shopifyConfig}
            clientData={legacyClientData}
          />

        {/* Shopify Orders - Lazy Loaded */}
        <div ref={shopifyRef}>
          {shopifyConfig.connected && isShopifyVisible ? (
                <ShopifyOrders
                  shopifyConfig={shopifyConfig}
                  clientData={legacyClientData}
                />
              ) : (
                <SidebarCard title={t('tickets.shopifyOrders')} id="shopify-orders">
                  <div 
                    className="text-sm text-muted-foreground py-4 text-center"
                    role="status"
                    aria-live="polite"
                  >
                    {t('tickets.loadingOrders')}
                  </div>
                </SidebarCard>
              )
          }
        </div>

        {/* Quick Responses / Macros */}
        <SidebarCard title={t('tickets.quickResponses')} id="quick-responses">
          <MacroSearch
            items={macros}
            groups={macroGroups}
            placeholder={t('tickets.searchMacros')}
            eventName="MacroChoosen"
            customerID={customer.id}
            ctx={macroContext}
          />
        </SidebarCard>

        {/* Assignment (Employee or Group) */}
        <SidebarCard title={t('tickets.assignTo')} id="assign-to">
          <AssignDropdown
            groups={groups}
            employees={employees}
            placeholder={t('tickets.searchEmployeeOrGroup')}
            eventName="Zuweisung"
            customerId={customer.id}
            assigned={assignedName}
          />
        </SidebarCard>
      </div>
    </aside>
  );
};
