/**
 * Shopify Orders Component
 * 
 * Displays customer order history from Shopify store
 * Features:
 * - Async order loading
 * - Order details (number, date, status, items)
 * - Financial and fulfillment status badges
 * - Link to Shopify admin
 * - Loading, error, and empty states
 */

import { useEffect, useState } from 'react';
import type { ShopifyConfig, ShopifyClientData, ShopifyOrder } from '../types/shopify.types';
import { apiClient } from '../utils/api'; // ✅ ADDED: Import apiClient
import { ShoppingBag } from 'lucide-react';

interface ShopifyOrdersProps {
  shopifyConfig: ShopifyConfig;
  clientData: ShopifyClientData;
}

export const ShopifyOrders: React.FC<ShopifyOrdersProps> = ({ shopifyConfig, clientData }) => {
  const [orders, setOrders] = useState<ShopifyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!shopifyConfig.connected) {
      setLoading(false);
      return;
    }

    // Delay the fetch slightly to not block the initial page render
    const timeoutId = setTimeout(() => {
      loadShopifyOrders();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [shopifyConfig.connected, shopifyConfig.customerId]);

  const loadShopifyOrders = async () => {
    console.log("[shopify-loader] Starting async Shopify order fetch");
    
    setLoading(true);
    setError(false);

    try {
      // ✅ FIXED: Use apiClient instead of raw fetch
      // ✅ FIXED: Auth token is automatically added by apiClient
      const data = await apiClient.get(
        `/shopify/orders?customerId=${shopifyConfig.customerId}`
      );

      if (data.error) {
        console.error("[shopify-loader] API returned error:", data.error);
        setError(true);
        setLoading(false);
        return;
      }

      const fetchedOrders = data.orders || [];
      console.log("[shopify-loader] Loaded", fetchedOrders.length, "orders");
      
      setOrders(fetchedOrders);
      setLoading(false);

    } catch (err) {
      console.error("[shopify-loader] Error loading orders:", err);
      setError(true);
      setLoading(false);
    }
  };

  const getFinancialStatusClass = (status: string): string => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'refunded':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getFulfillmentStatusClass = (status: string): string => {
    switch (status) {
      case 'fulfilled':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // If Shopify is not connected, don't render anything
  if (!shopifyConfig.connected) {
    return null;
  }

  return (
    <div className="bg-background rounded-lg border p-4 space-y-4 mb-6 bg-card text-card-foreground shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShoppingBag className="inline-block h-4 w-4 text-muted-foreground ml-1" />
        <h3 className="text-sm font-semibold">Shopify Orders</h3>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-2 text-muted-foreground">
            <svg 
              className="animate-spin h-5 w-5" 
              xmlns="http://www.w3.org/2000/svg" 
              fill="none" 
              viewBox="0 0 24 24"
            >
              <circle 
                className="opacity-25" 
                cx="12" 
                cy="12" 
                r="10" 
                stroke="currentColor" 
                strokeWidth="4"
              />
              <path 
                className="opacity-75" 
                fill="currentColor" 
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-sm">Loading orders...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="text-center py-8">
          <svg 
            className="mx-auto h-8 w-8 text-muted-foreground mb-2" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
            />
          </svg>
          <p className="text-sm text-muted-foreground">
            Failed to load Shopify orders
          </p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && orders.length === 0 && (
        <div className="text-center py-8">
          <svg 
            className="mx-auto h-8 w-8 text-muted-foreground mb-2" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" 
            />
          </svg>
          <p className="text-sm text-muted-foreground">
            No orders found for this customer
          </p>
        </div>
      )}

      {/* Orders List */}
      {!loading && !error && orders.length > 0 && (
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {orders.slice(0, 10).map((order) => (
            <div 
              key={order.id} 
              className="rounded-lg border bg-background p-3 hover:bg-accent transition-colors"
            >
              {/* Order Header */}
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-sm font-semibold">Order #{order.order_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(order.created_at)}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${getFinancialStatusClass(order.financial_status)}`}>
                  {order.financial_status}
                </span>
              </div>

              {/* Order Details */}
              <div className="space-y-2">
                {/* Total Price */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Total:</span>
                  <span className="text-sm font-semibold">
                    {order.total_price} {order.currency}
                  </span>
                </div>

                {/* Fulfillment Status */}
                {order.fulfillment_status && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Fulfillment:</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${getFulfillmentStatusClass(order.fulfillment_status)}`}>
                      {order.fulfillment_status}
                    </span>
                  </div>
                )}

                {/* Line Items */}
                {order.line_items && order.line_items.length > 0 && (
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-1">
                      {order.line_items.length} item{order.line_items.length !== 1 ? 's' : ''}
                    </p>
                    <ul className="space-y-1">
                      {order.line_items.slice(0, 2).map((item, idx) => (
                        <li key={idx} className="text-xs">
                          • {item.quantity}x {item.name}
                        </li>
                      ))}
                      {order.line_items.length > 2 && (
                        <li className="text-xs text-muted-foreground italic">
                          + {order.line_items.length - 2} more
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Link to Shopify */}
                {order.id && clientData.shopify_store_url && (
                  <div className="mt-2 pt-2 border-t">
                    <a
                      href={`https://${clientData.shopify_store_url}/admin/orders/${order.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
                    >
                      View in Shopify
                      <svg 
                        className="w-3 h-3" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" 
                        />
                      </svg>
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};