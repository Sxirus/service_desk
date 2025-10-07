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
  phone?: string;
  email?: string;
  website?: string;
  
  // Tax fields
  tax_number?: string;
  vat_number?: string;
  
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