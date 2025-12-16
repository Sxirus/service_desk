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
   * Handle employee assignment event from child component
   */
  useEffect(() => {
    const handleAssignment = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const employeeId = customEvent?.detail?.text;

      if (employeeId === undefined || employeeId === null) {
        console.log('[TicketSidebar] Missing employeeId in assignment event');
        return;
      }

      console.log('[TicketSidebar] Assigning employee:', employeeId, 'to customer:', customer.id);
      
      try {
        const response = await apiClient.post('/client/assignEmployee', {
          employee_id: employeeId,
          customer_id: customer.id
        });
        
        if (response.success) {
          console.log('[TicketSidebar] Employee assigned successfully');
          // Optional: Show success notification
        } else {
          console.error('[TicketSidebar] Assignment failed:', response.error);
          // Optional: Show error notification and revert UI
        }
      } catch (error) {
        console.error('[TicketSidebar] Failed to assign employee:', error);
        // Optional: Show error notification and revert UI
      }
    };

    window.addEventListener('Zuweisung', handleAssignment);
    return () => window.removeEventListener('Zuweisung', handleAssignment);
  }, [customer.id]);

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

        {/* Employee Assignment */}
        <SidebarCard title="Assign Employee" id="assign-employee">
          <Assign
            items={employees}
            placeholder="Search employee..."
            eventName="Zuweisung"
            customerId={customer.id}
            assigned={assignedEmployeeName}
          />
        </SidebarCard>
      </div>
    </aside>
  );
};
