import { defineAction, type ActionAPIContext } from "astro:actions";
import { z } from "astro:schema";
import { createClient as createSSR } from "../lib/supabase.ts";
import { createClient as createAdmin } from "@supabase/supabase-js";

/* ----------------------- SIGN IN (Password) ----------------------- */

/**
 * Handles user sign-in with email and password
 * Includes CAPTCHA verification for security
 */
const emailSignIn = async (
  {
    email,
    password,
    captchaToken,
  }: {
    email: string;
    password: string;
    captchaToken: string;
  },
  context: ActionAPIContext
) => {
  console.log("[actions.signIn] start");
  try {
    // Create Supabase client with SSR context
    const supabase = createSSR({
      request: context.request,
      cookies: context.cookies,
    });
    console.log("[actions.signIn] Supabase client created");

    // Attempt to sign in with email, password, and CAPTCHA token
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    });
    console.log("[actions.signIn] Sign-in attempt completed");

    // Handle sign-in errors
    if (error) {
      console.error("[actions.signIn] error:", error);
      return { success: false, message: error.message };
    }

    console.log("[actions.signIn] ok:", data?.user?.id);
    return { success: true, message: "Successfully logged in" };
  } catch (err: any) {
    console.error("[actions.signIn] unexpected:", err?.message ?? err);
    return { success: false, message: "Unexpected error" };
  }
};

/* ----------------------- RESET PASSWORD (email) ----------------------- */

/**
 * Sends a password reset email to the user
 * Includes CAPTCHA verification to prevent abuse
 */
const passwordReset = async (
  {
    email,
    captchaToken,
  }: {
    email: string;
    captchaToken: string;
  },
  context: ActionAPIContext
) => {
  console.log("[actions.resetPassword] start");
  try {
    // Create Supabase client with SSR context
    const supabase = createSSR({
      request: context.request,
      cookies: context.cookies,
    });
    console.log("[actions.resetPassword] Supabase client created");

    // Send password reset email with redirect URL
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      captchaToken,
      redirectTo: "http://localhost:4321/update-password",
    });
    console.log("[actions.resetPassword] Password reset email attempt completed");

    // Handle reset email errors
    if (error) {
      console.error("[actions.resetPassword] error:", error);
      return { success: false, message: error.message };
    }

    console.log("[actions.resetPassword] ok:", data);
    return { success: true, message: "Password reset email sent" };
  } catch (err: any) {
    console.error("[actions.resetPassword] unexpected:", err?.message ?? err);
    return { success: false, message: "Unexpected error" };
  }
};

/* ----------------------- ADMIN: CREATE EMPLOYEE ----------------------- */

// Schema for validating employee creation input
const createEmployeeSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  // Role validation: 1 = admin, 2 = regular user
  role_id: z.coerce.number().int().refine((v) => v === 1 || v === 2, {
    message: "invalid role_id",
  }),
});

type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

/**
 * Admin-only function to create new employees
 * Validates admin permissions, creates user account, and assigns role
 */
const createEmployee = async (
  { email, name, role_id }: CreateEmployeeInput,
  context: ActionAPIContext
) => {
  console.log("[actions.createEmployee] start");
  try {
    // 1) Verify the current user is authenticated
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    console.log("[actions.createEmployee] SSR client created");
    
    const { data: { user }, error: userErr } = await ssr.auth.getUser();
    if (userErr || !user) {
      console.error("[actions.createEmployee] getUser error:", userErr?.message);
      return { success: false, message: "Unauthorized" };
    }
    console.log("[actions.createEmployee] User authenticated:", user.id);
  
    // 2) Get current employee record and client ID
    const { data: me, error: meErr } = await ssr
      .from("employees")
      .select("id, client_id")
      .eq("user_id", user.id)
      .single();

    if (meErr || !me) {
      console.error("[actions.createEmployee] employees lookup:", meErr?.message);
      return { success: false, message: "Forbidden" };
    }
    console.log("[actions.createEmployee] Current employee found:", me.id, "client:", me.client_id);

    // 3) Check if current user has admin role (role_id = 1)
    const { data: myRoles, error: rolesErr } = await ssr
      .from("roles-employees")
      .select("role_id")
      .eq("employee_id", me.id);

    if (rolesErr) {
      console.error("[actions.createEmployee] roles lookup:", rolesErr.message);
      return { success: false, message: "Forbidden" };
    }
    console.log("[actions.createEmployee] User roles:", myRoles);

    // Verify admin permissions
    const amIAdmin = !!myRoles?.some((r) => r.role_id === 1);
    if (!amIAdmin) {
      console.error("[actions.createEmployee] User is not admin");
      return { success: false, message: "Forbidden" };
    }
    console.log("[actions.createEmployee] Admin permissions verified");

    // 4) Create admin client using service role key (server-side only!)
    const admin = createAdmin(
      import.meta.env.SUPABASE_URL!,
      import.meta.env.SUPABASE_KEY!,
      { auth: { persistSession: false } }
    );
    console.log("[actions.createEmployee] Admin client created");

    // 5) Create new user in auth.users table
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: false, // User will confirm via reset password email
      user_metadata: { name },
    });
    if (createErr) {
      console.error("[actions.createEmployee] createUser:", createErr.message);
      return { success: false, message: createErr.message };
    }
    console.log("[actions.createEmployee] User created in auth:", created.user.id);

    // 6) Create employee record in same client/organization
    const { data: empRow, error: empErr } = await admin
      .from("employees")
      .insert({ user_id: created.user.id, client_id: me.client_id, name })
      .select("id")
      .single();
    if (empErr) {
      console.error("[actions.createEmployee] insert employees:", empErr.message);
      return { success: false, message: empErr.message };
    }
    console.log("[actions.createEmployee] Employee record created:", empRow.id);

    // 7) Assign role to the new employee
    const { error: relErr } = await admin
      .from("roles-employees")
      .insert({ role_id, employee_id: empRow.id });
    if (relErr) {
      console.error("[actions.createEmployee] insert roles-employees:", relErr.message);
      return { success: false, message: relErr.message };
    }
    console.log("[actions.createEmployee] Role assigned:", role_id);

    // 8) Send password reset email as account activation
    await admin.auth.resetPasswordForEmail(email, {
      redirectTo: new URL("/update-password", context.request.url).toString(),
    });
    console.log("[actions.createEmployee] Activation email sent");

    console.log("[actions.createEmployee] ok");
    return { success: true, message: "Employee created and invite sent" };
  } catch (e: any) {
    console.error("[actions.createEmployee] unexpected:", e?.message ?? e);
    return { success: false, message: "Unexpected error" };
  }
};

/* ----------------------- ADMIN: UPDATE EMPLOYEE ----------------------- */

// Schema for validating employee update input
const updateEmployeeSchema = z.object({
  id: z.coerce.number().int().positive(),
  email: z.string().email(),
  name: z.string().min(1),
  role_id: z.coerce.number().int().refine((v) => v === 1 || v === 2, {
    message: "invalid role_id",
  }),
});

type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

/**
 * Admin-only function to update existing employees
 * Validates admin permissions and updates employee data
 */
const updateEmployee = async (
  { id, email, name, role_id }: UpdateEmployeeInput,
  context: ActionAPIContext
) => {
  console.log("[actions.updateEmployee] start for employee:", id);
  try {
    // 1) Verify the current user is authenticated
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    console.log("[actions.updateEmployee] SSR client created");
    
    const { data: { user }, error: userErr } = await ssr.auth.getUser();
    if (userErr || !user) {
      console.error("[actions.updateEmployee] getUser error:", userErr?.message);
      return { success: false, message: "Unauthorized" };
    }
    console.log("[actions.updateEmployee] User authenticated:", user.id);
  
    // 2) Get current employee record and client ID
    const { data: me, error: meErr } = await ssr
      .from("employees")
      .select("id, client_id")
      .eq("user_id", user.id)
      .single();

    if (meErr || !me) {
      console.error("[actions.updateEmployee] employees lookup:", meErr?.message);
      return { success: false, message: "Forbidden" };
    }
    console.log("[actions.updateEmployee] Current employee found:", me.id, "client:", me.client_id);

    // 3) Check if current user has admin role (role_id = 1)
    const { data: myRoles, error: rolesErr } = await ssr
      .from("roles-employees")
      .select("role_id")
      .eq("employee_id", me.id);

    if (rolesErr) {
      console.error("[actions.updateEmployee] roles lookup:", rolesErr.message);
      return { success: false, message: "Forbidden" };
    }
    console.log("[actions.updateEmployee] User roles:", myRoles);

    // Verify admin permissions
    const amIAdmin = !!myRoles?.some((r) => r.role_id === 1);
    if (!amIAdmin) {
      console.error("[actions.updateEmployee] User is not admin");
      return { success: false, message: "Forbidden" };
    }
    console.log("[actions.updateEmployee] Admin permissions verified");

    // 4) Verify target employee belongs to same client
    const { data: targetEmployee, error: targetErr } = await ssr
      .from("employees")
      .select("user_id, client_id")
      .eq("id", id)
      .single();

    if (targetErr || !targetEmployee) {
      console.error("[actions.updateEmployee] target employee lookup:", targetErr?.message);
      return { success: false, message: "Employee not found" };
    }
    console.log("[actions.updateEmployee] Target employee found:", targetEmployee.user_id, "client:", targetEmployee.client_id);

    if (targetEmployee.client_id !== me.client_id) {
      console.error("[actions.updateEmployee] cross-client update attempt");
      return { success: false, message: "Forbidden: Different client" };
    }
    console.log("[actions.updateEmployee] Client verification passed");

    // 5) Create admin client using service role key
    const admin = createAdmin(
      import.meta.env.SUPABASE_URL!,
      import.meta.env.SUPABASE_KEY!,
      { auth: { persistSession: false } }
    );
    console.log("[actions.updateEmployee] Admin client created");

    // 6) Update user email and metadata in auth.users
    const { error: authUpdateErr } = await admin.auth.admin.updateUserById(
      targetEmployee.user_id,
      {
        email,
        user_metadata: { name },
      }
    );
    if (authUpdateErr) {
      console.error("[actions.updateEmployee] auth update error:", authUpdateErr.message);
      return { success: false, message: "Failed to update user auth data" };
    }
    console.log("[actions.updateEmployee] Auth data updated");

    // 7) Update employee name
    const { error: empUpdateErr } = await admin
      .from("employees")
      .update({ name })
      .eq("id", id);

    if (empUpdateErr) {
      console.error("[actions.updateEmployee] employee update error:", empUpdateErr.message);
      return { success: false, message: "Failed to update employee data" };
    }
    console.log("[actions.updateEmployee] Employee data updated");

    // 8) Update role assignment
    // First delete existing role assignments for this employee
    const { error: deleteRoleErr } = await admin
      .from("roles-employees")
      .delete()
      .eq("employee_id", id);

    if (deleteRoleErr) {
      console.error("[actions.updateEmployee] role deletion error:", deleteRoleErr.message);
      return { success: false, message: "Failed to update role assignments" };
    }
    console.log("[actions.updateEmployee] Old roles deleted");

    // Then insert new role
    const { error: insertRoleErr } = await admin
      .from("roles-employees")
      .insert({ role_id, employee_id: id });

    if (insertRoleErr) {
      console.error("[actions.updateEmployee] role insertion error:", insertRoleErr.message);
      return { success: false, message: "Failed to assign new role" };
    }
    console.log("[actions.updateEmployee] New role assigned:", role_id);

    console.log("[actions.updateEmployee] ok");
    return { success: true, message: "Employee updated successfully" };
  } catch (e: any) {
    console.error("[actions.updateEmployee] unexpected:", e?.message ?? e);
    return { success: false, message: "Unexpected error" };
  }
};

/* ----------------------- ADMIN: DELETE EMPLOYEE ----------------------- */

// Schema for validating employee deletion input
const deleteEmployeeSchema = z.object({
  id: z.coerce.number().int().positive(),
});

type DeleteEmployeeInput = z.infer<typeof deleteEmployeeSchema>;

/**
 * Admin-only function to delete employees
 * Validates admin permissions and removes employee data
 */
const deleteEmployee = async (
  { id }: DeleteEmployeeInput,
  context: ActionAPIContext
) => {
  console.log("[actions.deleteEmployee] start for employee:", id);
  try {
    // 1) Verify the current user is authenticated
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    console.log("[actions.deleteEmployee] SSR client created");
    
    const { data: { user }, error: userErr } = await ssr.auth.getUser();
    if (userErr || !user) {
      console.error("[actions.deleteEmployee] getUser error:", userErr?.message);
      return { success: false, message: "Unauthorized" };
    }
    console.log("[actions.deleteEmployee] User authenticated:", user.id);
  
    // 2) Get current employee record and client ID
    const { data: me, error: meErr } = await ssr
      .from("employees")
      .select("id, client_id")
      .eq("user_id", user.id)
      .single();

    if (meErr || !me) {
      console.error("[actions.deleteEmployee] employees lookup:", meErr?.message);
      return { success: false, message: "Forbidden" };
    }
    console.log("[actions.deleteEmployee] Current employee found:", me.id, "client:", me.client_id);

    // 3) Check if current user has admin role (role_id = 1)
    const { data: myRoles, error: rolesErr } = await ssr
      .from("roles-employees")
      .select("role_id")
      .eq("employee_id", me.id);

    if (rolesErr) {
      console.error("[actions.deleteEmployee] roles lookup:", rolesErr.message);
      return { success: false, message: "Forbidden" };
    }
    console.log("[actions.deleteEmployee] User roles:", myRoles);

    // Verify admin permissions
    const amIAdmin = !!myRoles?.some((r) => r.role_id === 1);
    if (!amIAdmin) {
      console.error("[actions.deleteEmployee] User is not admin");
      return { success: false, message: "Forbidden" };
    }
    console.log("[actions.deleteEmployee] Admin permissions verified");

    // 4) Prevent self-deletion
    if (id === me.id) {
      console.error("[actions.deleteEmployee] self-deletion attempt");
      return { success: false, message: "Cannot delete your own account" };
    }
    console.log("[actions.deleteEmployee] Self-deletion check passed");

    // 5) Verify target employee belongs to same client
    const { data: targetEmployee, error: targetErr } = await ssr
      .from("employees")
      .select("user_id, client_id")
      .eq("id", id)
      .single();

    if (targetErr || !targetEmployee) {
      console.error("[actions.deleteEmployee] target employee lookup:", targetErr?.message);
      return { success: false, message: "Employee not found" };
    }
    console.log("[actions.deleteEmployee] Target employee found:", targetEmployee.user_id, "client:", targetEmployee.client_id);

    if (targetEmployee.client_id !== me.client_id) {
      console.error("[actions.deleteEmployee] cross-client deletion attempt");
      return { success: false, message: "Forbidden: Different client" };
    }
    console.log("[actions.deleteEmployee] Client verification passed");

    // 6) Create admin client using service role key
    const admin = createAdmin(
      import.meta.env.SUPABASE_URL!,
      import.meta.env.SUPABASE_KEY!,
      { auth: { persistSession: false } }
    );
    console.log("[actions.deleteEmployee] Admin client created");

    // 7) Delete role assignments first (foreign key constraint)
    const { error: deleteRoleErr } = await admin
      .from("roles-employees")
      .delete()
      .eq("employee_id", id);

    if (deleteRoleErr) {
      console.error("[actions.deleteEmployee] role deletion error:", deleteRoleErr.message);
      return { success: false, message: "Failed to remove role assignments" };
    }
    console.log("[actions.deleteEmployee] Role assignments deleted");

    // 8) Delete employee record
    const { error: empDeleteErr } = await admin
      .from("employees")
      .delete()
      .eq("id", id);

    if (empDeleteErr) {
      console.error("[actions.deleteEmployee] employee deletion error:", empDeleteErr.message);
      return { success: false, message: "Failed to delete employee" };
    }
    console.log("[actions.deleteEmployee] Employee record deleted");

    // 9) Delete user from auth.users (optional - you might want to keep auth records)
    const { error: authDeleteErr } = await admin.auth.admin.deleteUser(targetEmployee.user_id);
    if (authDeleteErr) {
      console.warn("[actions.deleteEmployee] auth deletion warning:", authDeleteErr.message);
      // Don't fail the entire operation if auth deletion fails
    } else {
      console.log("[actions.deleteEmployee] Auth user deleted");
    }

    console.log("[actions.deleteEmployee] ok");
    return { success: true, message: "Employee deleted successfully" };
  } catch (e: any) {
    console.error("[actions.deleteEmployee] unexpected:", e?.message ?? e);
    return { success: false, message: "Unexpected error" };
  }
};

/* ----------------------- ADMIN: UPDATE COMPANY ----------------------- */

// Schema for validating company update input
const updateCompanySchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().min(2, "Company name must be at least 2 characters"),

  // optionale Felder passend zur DB-Struktur
  address_street: z.string().trim().optional().nullable(),
  address_city: z.string().trim().optional().nullable(),
  // ZIP als string, weil CSV gemischt war
  address_zip: z.string().trim().optional().nullable(),
  address_country: z.string().trim().optional().nullable(),

  vat: z.string().trim().optional().nullable(),
  website: z.string().url("Website muss eine gültige URL sein").optional().nullable(),

  isActive: z.boolean().optional(),
});

type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

/**
 * Admin-only function to update company information
 * Validates admin permissions and updates company data
 */
const updateCompany = async (
  {
    id,
    name,
    address_street,
    address_city,
    address_zip,
    address_country,
    vat,
    website,
    isActive,
  }: UpdateCompanyInput,
  context: ActionAPIContext
) => {
  console.log("[actions.updateCompany] start for company:", id);
  try {
    // 1) User prüfen
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    console.log("[actions.updateCompany] SSR client created");
    
    const {
      data: { user },
      error: userErr,
    } = await ssr.auth.getUser();
    if (userErr || !user) {
      console.error("[actions.updateCompany] getUser error:", userErr?.message);
      return { success: false, message: "Unauthorized" };
    }
    console.log("[actions.updateCompany] User authenticated:", user.id);

    // 2) Employee und client_id ermitteln
    let me: { id: number; client_id: number } | null = null;
    try {
      const rpc = await ssr.rpc("get_my_employee").single();
      if (!rpc.error) {
        me = rpc.data as any;
        console.log("[actions.updateCompany] Employee found via RPC:", me);
      }
    } catch (e) {
      console.log("[actions.updateCompany] RPC fallback failed, trying direct query");
    }

    if (!me) {
      const { data: empData, error: meErr } = await ssr
        .from("employees")
        .select("id, client_id")
        .eq("user_id", user.id)
        .single();
      me = empData as any;
      if (meErr || !me) {
        console.error("[actions.updateCompany] employees lookup:", meErr?.message);
        return { success: false, message: "Unauthorized" };
      }
      console.log("[actions.updateCompany] Employee found via direct query:", me);
    }

    // 3) Rollen prüfen
    const { data: myRoles, error: rolesErr } = await ssr
      .from("roles-employees")
      .select("role_id")
      .eq("employee_id", me.id);

    if (rolesErr) {
      console.error("[actions.updateCompany] roles lookup:", rolesErr.message);
      return { success: false, message: "Forbidden" };
    }
    console.log("[actions.updateCompany] User roles:", myRoles);

    const amIAdmin = !!myRoles?.some((r) => r.role_id === 1);
    if (!amIAdmin) {
      console.error("[actions.updateCompany] User is not admin");
      return { success: false, message: "Forbidden: Admin role required" };
    }
    console.log("[actions.updateCompany] Admin permissions verified");

    // 4) Nur die eigene Firma darf aktualisiert werden
    if (me.client_id !== id) {
      console.error("[actions.updateCompany] client mismatch", { mine: me.client_id, target: id });
      return { success: false, message: "Forbidden: Wrong company" };
    }
    console.log("[actions.updateCompany] Company ownership verified");

    // 5) Service-Role Client (Server-side)
    const admin = createAdmin(
      import.meta.env.SUPABASE_URL!,
      import.meta.env.SUPABASE_KEY!,
      { auth: { persistSession: false } }
    );
    console.log("[actions.updateCompany] Admin client created");

    // 6) Update vorbereiten
    // Nur definierte Keys in das Update-Payload übernehmen
    const payload: Record<string, any> = {
      name,
      address_street: address_street ?? null,
      address_city: address_city ?? null,
      address_zip: address_zip ?? null,
      address_country: address_country ?? null,
      vat: vat ?? null,
      website: website ?? null,
    };

    if (typeof isActive === "boolean") {
      payload.isActive = isActive;
    }
    console.log("[actions.updateCompany] Update payload prepared:", payload);

    // 7) Update ausführen
    const { data, error } = await admin
      .from("clients")
      .update(payload)
      .eq("id", id)
      .select(
        "id, name, address_street, address_city, address_zip, address_country, vat, website, isActive"
      )
      .single();

    if (error) {
      console.error("[actions.updateCompany] update error:", error.message);
      return { success: false, message: `Database error: ${error.message}` };
    }

    if (!data) {
      console.error("[actions.updateCompany] No data returned from update");
      return { success: false, message: "Company not found or update failed" };
    }
    console.log("[actions.updateCompany] Company updated:", data);

    console.log("[actions.updateCompany] ok");
    return {
      success: true,
      message: "Company updated successfully",
      data,
    };
  } catch (e: any) {
    console.error("[actions.updateCompany] unexpected:", e?.message ?? e);
    return { success: false, message: "Unexpected error" };
  }
};

/* ======================================================
   REGISTRATION: save progress
   ====================================================== */

const saveRegistrationProgressSchema = z.object({
  reg_nonce: z.string().min(10),
  step: z.number().int().min(1).max(6),
  payload: z.record(z.any()).optional(),
});

const saveRegistrationProgress = async (
  { reg_nonce, step, payload }: z.infer<typeof saveRegistrationProgressSchema>,
  context: ActionAPIContext
) => {
  console.log("[actions.saveRegistrationProgress] start", { reg_nonce, step });
  try {
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    console.log("[actions.saveRegistrationProgress] SSR client created");
    
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) {
      console.error("[actions.saveRegistrationProgress] No authenticated user");
      // Allow anonymous draft sessions if you prefer. For now, require auth.
      return { success: false, message: "Unauthorized" };
    }
    console.log("[actions.saveRegistrationProgress] User authenticated:", user.id);

    const admin = createAdmin(import.meta.env.SUPABASE_URL!, import.meta.env.SUPABASE_KEY!, {
      auth: { persistSession: false },
    });
    console.log("[actions.saveRegistrationProgress] Admin client created");

    // Upsert registration session
    const { error } = await admin
      .from("registration_sessions")
      .upsert(
        {
          reg_nonce,
          user_id: user.id,
          status: "in_progress",
          partial_payload: payload ?? {},
          last_step: step,
        },
        { onConflict: "reg_nonce" }
      );

    if (error) {
      console.error("[actions.saveRegistrationProgress] upsert error:", error.message);
      return { success: false, message: error.message };
    }
    
    console.log("[actions.saveRegistrationProgress] Registration progress saved");
    return { success: true };
  } catch (e: any) {
    console.error("[actions.saveRegistrationProgress] unexpected:", e?.message ?? e);
    return { success: false, message: "Unexpected error" };
  }
};

/* ======================================================
   REGISTRATION: create account
   ====================================================== */
const registerCreateAccountSchema = z.object({
  reg_nonce: z.string().min(10),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  captchaToken: z.string(),
});

const registerCreateAccount = async (
  { reg_nonce, first_name, last_name, email, password, captchaToken }: z.infer<typeof registerCreateAccountSchema>,
  context: ActionAPIContext
) => {
  console.log("[actions.registerCreateAccount] start", { reg_nonce, email });
  const ssr = createSSR({ request: context.request, cookies: context.cookies });
  console.log("[actions.registerCreateAccount] SSR client created");

  // 1) Try sign up
  const signUpRes = await ssr.auth.signUp({
    email,
    password,
    options: {
      data: { first_name, last_name },
      captchaToken,
      emailRedirectTo: undefined, // no verification now
    },
  });
  console.log("[actions.registerCreateAccount] Sign up attempt completed");

  // 2) Handle signup errors
  if (signUpRes.error) {
    console.error("[actions.registerCreateAccount] Signup error:", signUpRes.error.message);
    // If user already exists, return specific error
    if (signUpRes.error.message.includes("already registered") || signUpRes.error.message.includes("already exists")) {
      return { success: false, message: "An account with this email already exists. Please sign in instead." };
    }
    return { success: false, message: signUpRes.error.message };
  }

  // 3) If no session was created, something went wrong
  if (!signUpRes.data.session && !signUpRes.data.user) {
    console.error("[actions.registerCreateAccount] No session or user created");
    return { success: false, message: "Failed to create account. Please try again." };
  }

  console.log("[actions.registerCreateAccount] Account created successfully");

  // 3) Persist registration session progress
  try {
    const admin = createAdmin(import.meta.env.SUPABASE_URL!, import.meta.env.SUPABASE_KEY!, {
      auth: { persistSession: false },
    });
    console.log("[actions.registerCreateAccount] Admin client created for session persistence");
    
    await admin
      .from("registration_sessions")
      .upsert(
        {
          reg_nonce,
          user_id: signUpRes.data.user?.id ?? null,
          status: "account_created",
          partial_payload: { first_name, last_name, email },
          last_step: 1,
        },
        { onConflict: "reg_nonce" }
      );
    console.log("[actions.registerCreateAccount] Registration session persisted");
  } catch (e: any) {
    console.warn("[actions.registerCreateAccount] Session persistence failed:", e?.message);
  }

  console.log("[actions.registerCreateAccount] ok");
  return { success: true, nextStep: 2 };
};

/* =========================================
   REGISTER: Create Company + Owner (Step 2)
   ========================================= */
const registerCreateCompanySchema = z.object({
  reg_nonce: z.string().min(10),
  name: z.string().min(2),
  address_street: z.string().min(2),
  address_zip: z.string().min(2),
  address_city: z.string().min(2),
  address_country: z.string().min(2),
  website: z.string().url().nullable().optional(),
  vat: z.string().nullable().optional(),
});

const ADMIN_ROLE_ID = 1;

const registerCreateCompany = async (
  {
    reg_nonce,
    name,
    address_street,
    address_zip,
    address_city,
    address_country,
    website,
    vat,
  }: z.infer<typeof registerCreateCompanySchema>,
  context: ActionAPIContext
) => {
  console.log("[actions.registerCreateCompany] start", { reg_nonce, name });
  const ssr = createSSR({ request: context.request, cookies: context.cookies });
  console.log("[actions.registerCreateCompany] SSR client created");
  
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) {
    console.error("[actions.registerCreateCompany] No authenticated user");
    return { success: false, message: "Unauthorized" };
  }
  console.log("[actions.registerCreateCompany] User authenticated:", user.id);

  // 1) Try SECURITY DEFINER RPC first
  try {
    const payload = {
      name,
      address_street,
      address_zip,
      address_city,
      address_country,
      website: website ?? null,
      vat: vat ?? null,
    };
    console.log("[actions.registerCreateCompany] Attempting RPC with payload:", payload);
    
    const rpc = await ssr.rpc("register_client_and_owner", { payload }).single();
    if (!rpc.error && rpc.data) {
      const clientData = rpc.data as { id: number; name: string };
      console.log("[actions.registerCreateCompany] RPC successful, client created:", clientData);
      
      await upsertRegSession(reg_nonce, user.id, 2, {
        company: { id: clientData.id, name: clientData.name },
      });
      console.log("[actions.registerCreateCompany] Registration session updated via RPC path");
      
      return { success: true, client_id: clientData.id };
    }
    console.log("[actions.registerCreateCompany] RPC failed, falling back to manual process");
    // fallthrough if RPC failed
  } catch (e: any) {
    console.log("[actions.registerCreateCompany] RPC exception, falling back:", e?.message);
    // continue to fallback
  }

  // 2) Fallback: perform inserts with service role (no true transaction)
  const admin = createAdmin(import.meta.env.SUPABASE_URL!, import.meta.env.SUPABASE_KEY!, {
    auth: { persistSession: false },
  });
  console.log("[actions.registerCreateCompany] Admin client created for fallback");

  // Guard: if the user already belongs to a client, block
  const { data: existingEmp } = await admin
    .from("employees")
    .select("id, client_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingEmp?.client_id) {
    console.error("[actions.registerCreateCompany] User already belongs to client:", existingEmp.client_id);
    return { success: false, message: "You already belong to a company." };
  }
  console.log("[actions.registerCreateCompany] User doesn't belong to any company yet");

  // Create client
  const { data: clientRow, error: clientErr } = await admin
    .from("clients")
    .insert({
      name,
      address_street,
      address_zip,
      address_city,
      address_country,
      website: website ?? null,
      vat: vat ?? null,
    })
    .select("id, name")
    .single();

  if (clientErr || !clientRow) {
    console.error("[actions.registerCreateCompany] Client creation failed:", clientErr?.message);
    return { success: false, message: clientErr?.message || "Failed to create company" };
  }
  console.log("[actions.registerCreateCompany] Client created:", clientRow);

  // Ensure employee
  const displayName =
    ((user.user_metadata as any)?.first_name || "") +
    (user.user_metadata?.last_name ? " " + (user.user_metadata as any).last_name : "");

  let employeeId: number | null = null;
  // try existing
  const { data: alreadyEmp } = await admin
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (alreadyEmp?.id) {
    employeeId = alreadyEmp.id;
    console.log("[actions.registerCreateCompany] Existing employee found:", employeeId);
    // also ensure client_id is set
    await admin.from("employees").update({ client_id: clientRow.id }).eq("id", employeeId);
    console.log("[actions.registerCreateCompany] Employee client_id updated");
  } else {
    const { data: empRow, error: empErr } = await admin
      .from("employees")
      .insert({ user_id: user.id, client_id: clientRow.id, name: displayName || user.email })
      .select("id")
      .single();
    if (empErr || !empRow) {
      console.error("[actions.registerCreateCompany] Employee creation failed:", empErr?.message);
      return { success: false, message: empErr?.message || "Failed to create employee" };
    }
    employeeId = empRow.id;
    console.log("[actions.registerCreateCompany] New employee created:", employeeId);
  }

  // Assign admin role (role_id = 1)
  // Statt upsert verwende insert mit expliziter Duplikat-Behandlung
  const { data: existingRole } = await admin
    .from("roles-employees")
    .select("*")
    .eq("employee_id", employeeId!)
    .eq("role_id", ADMIN_ROLE_ID)
    .maybeSingle();

  if (!existingRole) {
    const { error: roleErr } = await admin
      .from("roles-employees")
      .insert({ employee_id: employeeId!, role_id: ADMIN_ROLE_ID });
      
    if (roleErr) {
      console.error("[actions.registerCreateCompany] Role assignment failed:", roleErr);
      return { success: false, message: "Failed to assign admin role" };
    }
  }

  // Update registration session
  await upsertRegSession(reg_nonce, user.id, 2, {
    company: { id: clientRow.id, name: clientRow.name },
  });
  console.log("[actions.registerCreateCompany] Registration session updated via fallback path");

  console.log("[actions.registerCreateCompany] ok");
  return { success: true, client_id: clientRow.id };
};

async function upsertRegSession(reg_nonce: string, user_id: string, last_step: number, extra: Record<string, any>) {
  console.log("[upsertRegSession] start", { reg_nonce, user_id, last_step });
  try {
    const admin = createAdmin(import.meta.env.SUPABASE_URL!, import.meta.env.SUPABASE_KEY!, {
      auth: { persistSession: false },
    });
    await admin
      .from("registration_sessions")
      .upsert(
        {
          reg_nonce,
          user_id,
          status: last_step >= 2 ? "company_created" : "in_progress",
          partial_payload: extra,
          last_step,
        },
        { onConflict: "reg_nonce" }
      );
    console.log("[upsertRegSession] Registration session upserted successfully");
  } catch (e: any) {
    console.error("[upsertRegSession] Failed to upsert registration session:", e?.message);
  }
}

/* ======================================================
    EMAIL PROVIDERS LIST
   ====================================================== */

const getEmailProviders = async () => {
  const admin = createAdmin(import.meta.env.SUPABASE_URL!, import.meta.env.SUPABASE_KEY!, {
    auth: { persistSession: false },
  });

  const { data, error } = await admin
    .from("email-provider")
    .select("id, name, logo_url, imap, imap_port, smtp, smtp_port")
    .order("id", { ascending: true });

  if (error) return { success: false, message: error.message };
  return { success: true, providers: data ?? [] };
};

const getEmailProvidersSchema = z.object({});

/* ======================================================
    REGISTER: Create Support Mailbox
   ====================================================== */

const registerCreateSupportMailboxSchema = z.object({
  provider_id: z.number().int().positive(),
  email_address: z.string().email(),
  password: z.string().min(1),
  imap: z.string().min(1),
  imap_port: z.number().int().min(1),
  smtp: z.string().min(1),
  smtp_port: z.number().int().min(1),
});

const registerCreateSupportMailbox = async (
  input: z.infer<typeof registerCreateSupportMailboxSchema>,
  context: ActionAPIContext
) => {
  const ssr = createSSR({ request: context.request, cookies: context.cookies });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return { success: false, message: "Unauthorized" };

  // Ermittle employee & client_id des aktuellen Users
  const admin = createAdmin(import.meta.env.SUPABASE_URL!, import.meta.env.SUPABASE_KEY!, {
    auth: { persistSession: false },
  });

  const { data: employee, error: empErr } = await admin
    .from("employees")
    .select("id, client_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (empErr || !employee?.client_id) {
    return { success: false, message: "No employee/client context" };
  }

  const payload = {
    client_id: employee.client_id,
    provider_id: input.provider_id,
    email_address: input.email_address,
    password: input.password,
    imap: input.imap,
    imap_port: input.imap_port,
    smtp: input.smtp,
    smtp_port: input.smtp_port,
    created_by: user.id,
  };

  const { data, error } = await admin
    .from("client-emails")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) return { success: false, message: error?.message || "Insert failed" };
  return { success: true, client_email_id: data.id };
};

/* ======================================================
    REGISTER: Test Support Mailbox
   ====================================================== */

const registerTestSupportMailboxSchema = z.object({
  client_email_id: z.number().int().positive(),
});

const registerTestSupportMailbox = async (
  _input: z.infer<typeof registerTestSupportMailboxSchema>,
  _context: ActionAPIContext
) => {
  // TODO: Implement actual IMAP/SMTP connection testing
  // For now, this is a stub that simulates a successful connection
  console.log("[actions.registerTestSupportMailbox] Testing mailbox connection (stub)");
  await new Promise((r) => setTimeout(r, 500));
  
  // In production, you should:
  // 1. Fetch the mailbox config from database using client_email_id
  // 2. Attempt IMAP connection
  // 3. Attempt SMTP connection
  // 4. Return actual test results
  
  return { success: true, message: "Connection test passed (simulated)" };
};



/* ----------------------- EXPORTS ----------------------- */

export const server = {
  // User sign-in with email/password and CAPTCHA
  signIn: defineAction({
    accept: "form",
    input: z.object({
      email: z.string().email(),
      password: z.string().min(6),
      captchaToken: z.string(),
    }),
    handler: (input, context) => emailSignIn(input, context),
  }),

  // User sign-out - clears session cookies
  signOut: defineAction({
    handler: async (_input, context) => {
      console.log("[actions.signOut] start");
      const supabase = createSSR({ request: context.request, cookies: context.cookies });
      console.log("[actions.signOut] SSR client created");
      
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("[actions.signOut] error:", error);
        return { success: false, message: error.message };
      }
      console.log("[actions.signOut] ok");
      return { success: true, message: "Successfully signed out" };
    },
  }),

  // Password reset via email with CAPTCHA
  resetPassword: defineAction({
    accept: "form",
    input: z.object({
      email: z.string().email(),
      captchaToken: z.string(),
    }),
    handler: (input, context) => passwordReset(input, context),
  }),

  // Admin-only employee creation with role assignment
  createEmployee: defineAction({
    accept: "form",
    input: createEmployeeSchema,
    handler: (input, context) => createEmployee(input, context),
  }),

  // Admin-only employee update
  updateEmployee: defineAction({
    accept: "form",
    input: updateEmployeeSchema,
    handler: (input, context) => updateEmployee(input, context),
  }),

  // Admin-only employee deletion
  deleteEmployee: defineAction({
    accept: "form",
    input: deleteEmployeeSchema,
    handler: (input, context) => deleteEmployee(input, context),
  }),

  // Admin-only company update
  updateCompany: defineAction({
    accept: "json",
    input: updateCompanySchema,
    handler: (input, context) => updateCompany(input, context),
  }),

  saveRegistrationProgress: defineAction({
    accept: "json",
    input: saveRegistrationProgressSchema,
    handler: (input, context) => saveRegistrationProgress(input, context),
  }),

  registerCreateAccount: defineAction({
    accept: "json",
    input: registerCreateAccountSchema,
    handler: (input, context) => registerCreateAccount(input, context),
  }),

  registerCreateCompany: defineAction({
    accept: "json",
    input: registerCreateCompanySchema,
    handler: (input, context) => registerCreateCompany(input, context),
  }),

  getEmailProviders: defineAction({
    accept: "json",
    input: getEmailProvidersSchema,
    handler: () => getEmailProviders(),
  }),

  registerCreateSupportMailbox: defineAction({
    accept: "json",
    input: registerCreateSupportMailboxSchema,
    handler: (input, context) => registerCreateSupportMailbox(input, context),
  }),

  registerTestSupportMailbox: defineAction({
    accept: "json",
    input: registerTestSupportMailboxSchema,
    handler: (input, context) => registerTestSupportMailbox(input, context),
  }),

};