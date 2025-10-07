// src/lib/auth-helpers.ts
import type { AstroCookies } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";

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

export async function getAuthContext(
  supabase: SupabaseClient,
  cookies: AstroCookies
): Promise<AuthContext | null> {
  // Verify user
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    console.error("[auth] User verification failed:", userErr?.message);
    return null;
  }

  // Get employee - try RPC first, then direct query
  let employee: { id: number; client_id: number } | null = null;
  
  try {
    const { data, error } = await supabase.rpc("get_my_employee").single();
    if (!error && data) {
      employee = data as any;
    }
  } catch (err) {
    console.log("[auth] RPC failed, trying direct query");
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
    employee = data;
  }

  if (!employee) {
    console.error("[auth] No employee record found for user:", user.id);
    return null;
  }

  // Check admin role
  const { data: roles, error: rolesErr } = await supabase
    .from("roles-employees")
    .select("role_id")
    .eq("employee_id", employee.id);

  if (rolesErr) {
    console.error("[auth] Roles lookup failed:", rolesErr.message);
    return null;
  }

  const isAdmin = roles?.some((r) => r.role_id === 1) ?? false;

  return {
    user: {
      id: user.id,
      email: user.email ?? "",
    },
    employee,
    isAdmin,
  };
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
}

export async function getSidebarData(
  supabase: SupabaseClient,
  authContext: AuthContext
): Promise<SidebarData> {
  // Get client data
  const { data: clientData } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", authContext.employee.client_id)
    .single();

  // Get employee name
  const { data: employees } = await supabase
    .from("employees")
    .select("id, name")
    .eq("client_id", authContext.employee.client_id)
    .order("name");

  const employeeName = employees?.find((e) => e.id === authContext.employee.id)?.name 
    ?? authContext.user.email 
    ?? "User";

  return {
    user: {
      name: employeeName,
      email: authContext.user.email,
      avatarUrl: null,
    },
    team: clientData?.name 
      ? { name: clientData.name, plan: "Enterprise" }
      : null,
  };
}