/**
 * Shopify Type Definitions
 * 
 * Central type definitions for Shopify integration
 * Used across the application for type safety
 */

/**
 * Configuration for Shopify integration
 */
export interface ShopifyConfig {
  connected: boolean;
  customerId: string | number;
}

/**
 * Client data with Shopify connection info
 */
export interface ShopifyClientData {
  id?: number;
  name?: string;
  shopify_store_url?: string;
  shopify_access_token?: string;
  shopify_connected?: boolean;
  shopify_scope?: string;
}

/**
 * Line item in a Shopify order
 */
export interface ShopifyLineItem {
  name: string;
  quantity: number;
  price?: string;
  product_id?: string;
  variant_id?: string;
}

/**
 * Shopify order object
 */
export interface ShopifyOrder {
  id: string;
  order_number: string;
  created_at: string;
  financial_status: 'paid' | 'pending' | 'refunded' | 'partially_paid' | 'authorized' | 'voided';
  fulfillment_status?: 'fulfilled' | 'partial' | 'unfulfilled' | null;
  total_price: string;
  currency: string;
  line_items?: ShopifyLineItem[];
  customer_id?: string;
  email?: string;
  note?: string;
  tags?: string;
}

/**
 * Response from Shopify orders API
 */
export interface ShopifyOrdersResponse {
  orders: ShopifyOrder[];
  error?: string;
}

/**
 * Shopify customer address
 */
export interface ShopifyAddress {
  address1: string;
  address2?: string;
  city: string;
  province?: string;
  province_code?: string;
  zip: string;
  country: string;
  country_code?: string;
  company?: string;
}

/**
 * Shopify customer object
 */
export interface ShopifyCustomer {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  orders_count: number;
  total_spent: string;
  currency?: string;
  default_address?: ShopifyAddress;
  phone?: string;
  verified_email?: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * Response from Shopify customer info API
 */
export interface ShopifyCustomerInfoResponse {
  customer?: ShopifyCustomer;
  error?: string;
}