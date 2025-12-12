// src/types/database.ts

/**
 * Database Type Definitions
 * Provides type safety for database operations
 */

export interface Employee {
  id: number;
  client_id: number;
  user_id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export interface Client {
  id: number;
  name: string;
  
  // Address fields
  address_street?: string;
  address_city?: string;
  address_zip?: string;
  address_country?: string;
  
  // Contact fields
  website?: string;
  
  // Tax fields
  vat?: string;
  
  // Shopify integration fields
  shopify_store_url?: string;
  shopify_access_token?: string;
  shopify_connected?: boolean;
  shopify_scope?: string;
  
  // Timestamps
  created_at?: string;
  updated_at?: string;
}

export interface Role {
  id: number;
  name: string;
  description?: string;
}

export interface RoleEmployee {
  employee_id: number;
  role_id: number;
  assigned_at?: string;
}

export interface User {
  id: string;
  email: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Common role IDs for quick reference
 */
export const ROLE_IDS = {
  ADMIN: 1,
  USER: 2,
  // Add other role IDs as needed
} as const;

export type RoleId = typeof ROLE_IDS[keyof typeof ROLE_IDS];

export interface EmailProvider {
  name: string;
  smtp: string;
  smtp_port: number;
}

export interface ClientEmail {
  id: number;
  email_address: string;
  active: boolean;
  provider_id: number;
  'email-provider': EmailProvider;
}


// ============================================================================
// RPC RESPONSE TYPES
// ============================================================================

/**
 * Response type for get_my_employee RPC
 */
export interface GetMyEmployeeResponse {
  id: number;
  client_id: number;
}

/**
 * Response type for get_employee_emails RPC
 */
export interface EmployeeEmailRow {
  employee_id: number;
  email: string;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Email signature API response
 */
export interface EmailSignatureResponse {
  email_signature: string;
  client_id: number;
  updated_at?: string;
}

/**
 * Form data types for components
 */
export interface CompanyFormData {
  id: number;
  name: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  vat: string;
  website: string;
}

export interface ShopifyFormData {
  id: number;
  name: string;
  shopifyStoreUrl: string | null;
  shopifyConnected: boolean;
  shopifyScope: string | null;
}