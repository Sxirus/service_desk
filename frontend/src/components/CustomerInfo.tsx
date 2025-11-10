/**
 * Customer Information Component
 * 
 * Displays customer information from email and optionally from Shopify
 * Features:
 * - Name with source indicators (Email/Shopify icons)
 * - Email address
 * - Shopify customer data (if available):
 *   - Full address (German format)
 *   - Total orders count
 *   - Total amount spent
 */

import { useEffect, useState } from 'react';
import { Mail, ShoppingBag, MapPin, Package, Euro, User } from 'lucide-react';
import type { ShopifyConfig, ShopifyClientData, ShopifyCustomer } from '../types/shopify.types';
import { apiClient } from '../utils/api'; // ✅ ADDED: Import apiClient
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface CustomerInfoProps {
  customer: {
    id: number;
    name: string;
  };
  emailAddress: string;
  shopifyConfig: ShopifyConfig;
  clientData: ShopifyClientData;
}

export const CustomerInfo: React.FC<CustomerInfoProps> = ({ 
  customer, 
  emailAddress, 
  shopifyConfig,
  clientData 
}) => {
  const [shopifyCustomer, setShopifyCustomer] = useState<ShopifyCustomer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!shopifyConfig.connected) {
      return;
    }

    // Fetch Shopify customer info
    const fetchCustomerInfo = async () => {
      console.log("[customer-info] Fetching Shopify customer data");
      setLoading(true);
      setError(false);

      try {
        // ✅ FIXED: Use apiClient instead of raw fetch
        // ✅ FIXED: Auth token is automatically added by apiClient
        const data = await apiClient.get(
          `/shopify/customer?email=${encodeURIComponent(emailAddress)}`
        );

        if (data.error) {
          console.error("[customer-info] API returned error:", data.error);
          setError(true);
          setLoading(false);
          return;
        }

        if (data.customer) {
          console.log("[customer-info] Shopify customer data loaded");
          setShopifyCustomer(data.customer);
        } else {
          console.log("[customer-info] No Shopify customer found for this email");
        }

        setLoading(false);
      } catch (err) {
        console.error("[customer-info] Error loading customer data:", err);
        setError(true);
        setLoading(false);
      }
    };

    // Small delay to not block initial render
    const timeoutId = setTimeout(fetchCustomerInfo, 50);
    return () => clearTimeout(timeoutId);
  }, [shopifyConfig.connected, emailAddress]);

  // Format address in German format
  const formatAddress = (address: ShopifyCustomer['default_address']): string[] => {
    if (!address) return [];

    const lines: string[] = [];

    // Company (if exists)
    if (address.company) {
      lines.push(address.company);
    }

    // Street address
    if (address.address1) {
      lines.push(address.address1);
    }
    if (address.address2) {
      lines.push(address.address2);
    }

    // ZIP City format (German standard)
    const cityLine = `${address.zip || ''} ${address.city || ''}`.trim();
    if (cityLine) {
      lines.push(cityLine);
    }

    // Country
    if (address.country) {
      lines.push(address.country);
    }

    return lines;
  };

  const addressLines = shopifyCustomer?.default_address 
    ? formatAddress(shopifyCustomer.default_address) 
    : [];

  // Format currency
  const formatCurrency = (amount: string, currency?: string): string => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) return amount;

    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: currency || 'EUR',
    }).format(numAmount);
  };

  return (
    <div className="rounded-lg border mb-6 bg-card text-card-foreground shadow-sm">
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
            <User className="inline-block h-4 w-4 text-muted-foreground ml-1" />
            <h3 className="text-sm font-semibold">Customer Information</h3>
        </div>

        <div className="space-y-3">
          {/* Name with source indicators */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Name</p>
            <div className="flex items-center gap-2">
                <Tooltip>
                    <TooltipTrigger>
                        <p className="text-sm font-medium">
                            {customer.name}
                            <Mail className="inline-block h-3 w-3 text-muted-foreground ml-1" />
                        </p>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Name extracted from E-Mail-Sender</p>
                    </TooltipContent>
                </Tooltip>
            </div>
            {shopifyCustomer && (
                <div className="flex items-center gap-2">
                    <Tooltip>
                        <TooltipTrigger>
                            <p className="text-xs text-muted-foreground mt-1">
                                {shopifyCustomer.first_name} {shopifyCustomer.last_name}
                                <ShoppingBag className="inline-block h-3 w-3 text-muted-foreground ml-1" />
                            </p>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Name extracted from Shopify</p>
                        </TooltipContent>
                    </Tooltip>
                </div>
            )}
          </div>

          {/* Email */}
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="text-sm font-medium text-blue-600 break-all">
              {emailAddress}
            </p>
          </div>

          {/* Loading State for Shopify Data */}
          {loading && shopifyConfig.connected && (
            <div className="pt-2 border-t">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                <span className="text-xs">Loading Shopify data...</span>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && !loading && shopifyConfig.connected && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Could not load Shopify customer data
              </p>
            </div>
          )}

          {/* Shopify Customer Data */}
          {shopifyCustomer && !loading && (
            <>
              {/* Address */}
              {addressLines.length > 0 && (
                <div className="pt-2 border-t">
                  <div className="flex items-start gap-2 mb-1">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">Address</p>
                  </div>
                  <div className="text-sm ml-5">
                    {addressLines.map((line, idx) => (
                      <p key={idx} className="leading-relaxed">{line}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Customer Stats */}
              <div className="pt-2 border-t space-y-2">
                <p className="text-xs text-muted-foreground font-semibold">Customer Stats</p>
                
                {/* Total Orders */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Total Orders</span>
                  </div>
                  <span className="text-sm font-semibold">
                    {shopifyCustomer.orders_count}
                  </span>
                </div>

                {/* Total Spent */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Euro className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Total Spent</span>
                  </div>
                  <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                    {formatCurrency(shopifyCustomer.total_spent, shopifyCustomer.currency)}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* No Shopify Data Message */}
          {!shopifyCustomer && !loading && !error && shopifyConfig.connected && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground italic">
                No Shopify Data available for this customer.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};