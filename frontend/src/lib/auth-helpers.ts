// src/lib/auth-helpers.ts

import type { AstroCookies } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_IDS } from "../types/database";
import type { 
  GetMyEmployeeResponse,
} from "../types/database";
import { createPageLogger } from "../utils/logger.ts";
import type { User } from "@/components/datatable/columns.tsx";

const log = createPageLogger('auth-helpers');

export interface AuthContext {
  user: {
    id: string;
    email: string;
  };
  employee: {
    id: number;
    client_id: number;
  };
  isAdmin: boolean;
}

export interface SidebarData {
  user: {
    name: string;
    email: string | null;
    avatarUrl: string | null;
  };
  team: {
    name: string;
    plan: string;
  } | null;
  employeeId: number;
  clientId: number;
  subscriptionTier: string;
}

/**
 * Get authenticated user and employee context
 * Verifies authentication and retrieves employee information
 */
export async function getAuthContext(
  supabase: SupabaseClient,
  cookies: AstroCookies,
  preAuthenticatedUser?: any
): Promise<AuthContext | null> {
  // Verify user
  let user = preAuthenticatedUser;
  
  if (user) {
    log.info("Using preAuthenticatedUser for Auth");
  } else {
    log.info("No pre-authenticated user provided, fetching from Supabase");
    const { data: user_supabase , error: userErr } = await supabase.auth.getUser();
    user = user_supabase.user;
    if (userErr || !user) {
      console.error("[auth] User verification failed:", userErr?.message);
      return null;
    }
  }

  // Get employee - try RPC first, then direct query
  let employee: GetMyEmployeeResponse | null = null;
  
  try {
    const { data, error } = await supabase
      .rpc("get_my_employee")
      .single();
    
    if (!error && data) {
      employee = data as GetMyEmployeeResponse;
    }
  } catch (err) {
    log.error("RPC failed, trying direct query");
  }

  if (!employee) {
    const { data, error } = await supabase
      .from("employees")
      .select("id, client_id")
      .eq("user_id", user.id)
      .single();
    
    if (error) {
      console.error("[auth] Employee lookup failed:", error.message);
      return null;
    }
    employee = data as GetMyEmployeeResponse;
  }

  if (!employee) {
    console.error("[auth] No employee record found for user:", user.id);
    return null;
  }

  // Check admin role - using ROLE_IDS constant
  const { data: roles, error: rolesErr } = await supabase
    .from("roles-employees")
    .select("role_id")
    .eq("employee_id", employee.id);

  if (rolesErr) {
    console.error("[auth] Roles lookup failed:", rolesErr.message);
    return null;
  }

  const isAdmin = roles?.some((r) => r.role_id === ROLE_IDS.ADMIN) ?? false;

  return {
    user: {
      id: user.id,
      email: user.email ?? "",
    },
    employee,
    isAdmin,
  };
}

/**
 * Get sidebar data
 * Retrieves user info and team details for the sidebar
 */
export async function getSidebarData(
  supabase: SupabaseClient,
  authContext: AuthContext
): Promise<SidebarData> {
  log.info("Loading sidebar data");

  // Parallel queries for better performance
  const [
    { data: clientData, error: clientError },
    { data: employees }
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, subscription_tier")
      .eq("id", authContext.employee.client_id)
      .single(),
    supabase
      .from("employees")
      .select("id, name, avatar_url")
      .eq("client_id", authContext.employee.client_id)
      .order("name")
  ]);

  log.info("Client data fetched:", { clientData, clientError });

  const myEmployee = employees?.find((e) => e.id === authContext.employee.id);
  const employeeName = myEmployee?.name && myEmployee.name.trim() 
    ? myEmployee.name 
    : authContext.user.email 
    ?? "User";

  const sidebarData: SidebarData = {
    user: {
      name: employeeName,
      email: authContext.user.email,
      avatarUrl: myEmployee?.avatar_url ?? null,
    },
    team: clientData?.name 
      ? { name: clientData.name, plan: clientData.subscription_tier === "paid" ? "Professional Use" : "Free Use" }
      : null,
    employeeId: authContext.employee.id,
    clientId: authContext.employee.client_id,
    subscriptionTier: clientData?.subscription_tier ?? "free",
  };

  log.info("sidebarData.subscriptionTier:", sidebarData.subscriptionTier);

  return sidebarData;
}

/**
 * Get complete page context (auth + sidebar) in one call
 * Simplifies page setup code
 */
export async function getCompletePageContext(
  supabase: SupabaseClient,
  cookies: AstroCookies,
  preAuthenticatedUser?: any
): Promise<{
  authContext: AuthContext;
  sidebarData: SidebarData;
} | null> {
  const authContext = await getAuthContext(supabase, cookies, preAuthenticatedUser);
  if (!authContext) return null;
  
  const sidebarData = await getSidebarData(supabase, authContext);
  
  return { authContext, sidebarData };
}