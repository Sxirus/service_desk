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
import { MacroSearch } from './macroSearch.jsx';
import { Assign } from './zuweisung.jsx';
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
  const shopifyRef = useRef<HTMLDivElement>(null);
  const isShopifyVisible = useIntersectionObserver(shopifyRef, {
    threshold: 0.1,
    rootMargin: '100px'
  });

  const [groups, setGroups] = useState<Array<{id: number; name: string; description: string | null}>>([]);
  const [assignedName, setAssignedName] = useState<string | null>(null);
  const [combinedAssignments, setCombinedAssignments] = useState<Array<{title: string; text: string; type: 'employee' | 'group'}>>([]);

  // Load groups on mount
  useEffect(() => {
    const loadGroups = async () => {
      try {
        const response = await apiClient.get('/groups/getGroups');
        if (response.success) {
          setGroups(response.data || []);
        }
      } catch (error) {
        console.error('[TicketSidebar] Failed to load groups:', error);
      }
    };
    
    loadGroups();
  }, []);

  // Combine employees and groups into single list, determine assigned name
  useEffect(() => {
    // Create combined list with type indicators
    const employeeItems = employees.map(emp => ({
      title: `👤 ${emp.title}`,
      text: `employee:${emp.text}`,
      type: 'employee' as const
    }));

    const groupItems = groups.map(group => ({
      title: `👥 ${group.name}`,
      text: `group:${group.id}`,
      type: 'group' as const
    }));

    setCombinedAssignments([...groupItems, ...employeeItems]);

    // Determine what is currently assigned
    // Priority: group_id > employee_id
    if (customer.group_id) {
      // Only update if we have groups loaded
      if (groups.length > 0) {
        const assignedGroup = groups.find(g => g.id === customer.group_id);
        if (assignedGroup) {
          setAssignedName(`👥 ${assignedGroup.name}`);
          console.log('[TicketSidebar] Assigned group found:', assignedGroup.name);
        } else {
          console.warn('[TicketSidebar] Group ID', customer.group_id, 'not found in groups list');
        }
      } else {
        console.log('[TicketSidebar] Groups not yet loaded, waiting...');
      }
    } else if (assignedEmployeeName) {
      setAssignedName(`👤 ${assignedEmployeeName}`);
      console.log('[TicketSidebar] Assigned employee found:', assignedEmployeeName);
    } else {
      setAssignedName(null);
      console.log('[TicketSidebar] No assignment found');
    }
  }, [employees, groups, customer.group_id, assignedEmployeeName]);

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
        console.log('[TicketSidebar] Missing assignment value in event');
        return;
      }

      // Parse the assignment value to determine type
      const [type, id] = assignmentValue.split(':');
      
      if (type === 'employee') {
        console.log('[TicketSidebar] Assigning employee:', id, 'to customer:', customer.id);
        
        try {
          const response = await apiClient.post('/client/assignEmployee', {
            employee_id: id,
            customer_id: customer.id
          });
          
          if (response.success) {
            console.log('[TicketSidebar] Employee assigned successfully');
            // Update local state
            const assignedEmp = employees.find(e => e.text === id);
            if (assignedEmp) {
              setAssignedName(`👤 ${assignedEmp.title}`);
            }
            toast.success(assignedEmp ? `Assigned to ${assignedEmp.title}` : 'Employee assigned successfully');
          } else {
            console.error('[TicketSidebar] Employee assignment failed:', response.error);
            toast.error('Failed to assign employee');
          }
        } catch (error) {
          console.error('[TicketSidebar] Failed to assign employee:', error);
          toast.error('Failed to assign employee');
        }
      } else if (type === 'group') {
        console.log('[TicketSidebar] Assigning group:', id, 'to customer:', customer.id);
        
        try {
          const response = await apiClient.post('/client/assignGroup', {
            group_id: id,
            customer_id: customer.id
          });
          
          if (response.success) {
            console.log('[TicketSidebar] Group assigned successfully');
            // Update local state
            const assignedGroup = groups.find(g => g.id === parseInt(id));
            if (assignedGroup) {
              setAssignedName(`👥 ${assignedGroup.name}`);
            }
            toast.success(assignedGroup ? `Assigned to ${assignedGroup.name}` : 'Group assigned successfully');
          } else {
            console.error('[TicketSidebar] Group assignment failed:', response.error);
            toast.error('Failed to assign group');
          }
        } catch (error) {
          console.error('[TicketSidebar] Failed to assign group:', error);
          toast.error('Failed to assign group');
        }
      } else if (type === 'unassign') {
        console.log('[TicketSidebar] Unassigning customer:', customer.id);
        
        try {
          const response = await apiClient.post('/client/unassign', {
            customer_id: customer.id
          });
          
          if (response.success) {
            console.log('[TicketSidebar] Unassigned successfully');
            setAssignedName(null);
            toast.success('Assignment removed');
          } else {
            console.error('[TicketSidebar] Unassign failed:', response.error);
            toast.error('Failed to remove assignment');
          }
        } catch (error) {
          console.error('[TicketSidebar] Failed to unassign:', error);
          toast.error('Failed to remove assignment');
        }
      }
    };

    window.addEventListener('Zuweisung', handleAssignment);
    return () => window.removeEventListener('Zuweisung', handleAssignment);
  }, [customer.id, groups, employees]);

  return (
    <aside 
      className="w-80 shrink-0 border-l bg-muted/30 flex flex-col overflow-hidden"
      role="complementary"
      aria-label="Ticket information sidebar"
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
                <SidebarCard title="Shopify Orders" id="shopify-orders">
                  <div 
                    className="text-sm text-muted-foreground py-4 text-center"
                    role="status"
                    aria-live="polite"
                  >
                    Loading orders...
                  </div>
                </SidebarCard>
              )
          }
        </div>

        {/* Quick Responses / Macros */}
        <SidebarCard title="Quick Responses" id="quick-responses">
          <MacroSearch
            items={macros}
            groups={macroGroups}
            placeholder="Search macros..."
            eventName="MacroChoosen"
            customerID={customer.id}
            ctx={macroContext}
          />
        </SidebarCard>

        {/* Assignment (Employee or Group) */}
        <SidebarCard title="Assign To" id="assign-to">
          <Assign
            items={combinedAssignments}
            placeholder="Search employee or group..."
            eventName="Zuweisung"
            customerId={customer.id}
            assigned={assignedName}
          />
        </SidebarCard>
      </div>
    </aside>
  );
};
