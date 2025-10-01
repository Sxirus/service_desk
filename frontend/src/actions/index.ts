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

    // Attempt to sign in with email, password, and CAPTCHA token
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    });

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

    // Send password reset email with redirect URL
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      captchaToken,
      redirectTo: "http://localhost:4321/update-password",
    });

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
    const { data: { user }, error: userErr } = await ssr.auth.getUser();
    if (userErr || !user) {
      console.error("[actions.createEmployee] getUser error:", userErr?.message);
      return { success: false, message: "Unauthorized" };
    }
  
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

    // 3) Check if current user has admin role (role_id = 1)
    const { data: myRoles, error: rolesErr } = await ssr
      .from("roles-employees")
      .select("role_id")
      .eq("employee_id", me.id);

    if (rolesErr) {
      console.error("[actions.createEmployee] roles lookup:", rolesErr.message);
      return { success: false, message: "Forbidden" };
    }

    // Verify admin permissions
    const amIAdmin = !!myRoles?.some((r) => r.role_id === 1);
    if (!amIAdmin) return { success: false, message: "Forbidden" };


    // 4) Create admin client using service role key (server-side only!)
    const admin = createAdmin(
      import.meta.env.SUPABASE_URL!,
      import.meta.env.SUPABASE_KEY!,
      { auth: { persistSession: false } }
    );


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


    // 7) Assign role to the new employee
    const { error: relErr } = await admin
      .from("roles-employees")
      .insert({ role_id, employee_id: empRow.id });
    if (relErr) {
      console.error("[actions.createEmployee] insert roles-employees:", relErr.message);
      return { success: false, message: relErr.message };
    }


    // 8) Send password reset email as account activation
    await admin.auth.resetPasswordForEmail(email, {
      redirectTo: new URL("/update-password", context.request.url).toString(),
    });

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
    const { data: { user }, error: userErr } = await ssr.auth.getUser();
    if (userErr || !user) {
      console.error("[actions.updateEmployee] getUser error:", userErr?.message);
      return { success: false, message: "Unauthorized" };
    }
  
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

    // 3) Check if current user has admin role (role_id = 1)
    const { data: myRoles, error: rolesErr } = await ssr
      .from("roles-employees")
      .select("role_id")
      .eq("employee_id", me.id);

    if (rolesErr) {
      console.error("[actions.updateEmployee] roles lookup:", rolesErr.message);
      return { success: false, message: "Forbidden" };
    }

    // Verify admin permissions
    const amIAdmin = !!myRoles?.some((r) => r.role_id === 1);
    if (!amIAdmin) return { success: false, message: "Forbidden" };

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

    if (targetEmployee.client_id !== me.client_id) {
      console.error("[actions.updateEmployee] cross-client update attempt");
      return { success: false, message: "Forbidden: Different client" };
    }

    // 5) Create admin client using service role key
    const admin = createAdmin(
      import.meta.env.SUPABASE_URL!,
      import.meta.env.SUPABASE_KEY!,
      { auth: { persistSession: false } }
    );

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

    // 7) Update employee name
    const { error: empUpdateErr } = await admin
      .from("employees")
      .update({ name })
      .eq("id", id);

    if (empUpdateErr) {
      console.error("[actions.updateEmployee] employee update error:", empUpdateErr.message);
      return { success: false, message: "Failed to update employee data" };
    }

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

    // Then insert new role
    const { error: insertRoleErr } = await admin
      .from("roles-employees")
      .insert({ role_id, employee_id: id });

    if (insertRoleErr) {
      console.error("[actions.updateEmployee] role insertion error:", insertRoleErr.message);
      return { success: false, message: "Failed to assign new role" };
    }

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
    const { data: { user }, error: userErr } = await ssr.auth.getUser();
    if (userErr || !user) {
      console.error("[actions.deleteEmployee] getUser error:", userErr?.message);
      return { success: false, message: "Unauthorized" };
    }
  
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

    // 3) Check if current user has admin role (role_id = 1)
    const { data: myRoles, error: rolesErr } = await ssr
      .from("roles-employees")
      .select("role_id")
      .eq("employee_id", me.id);

    if (rolesErr) {
      console.error("[actions.deleteEmployee] roles lookup:", rolesErr.message);
      return { success: false, message: "Forbidden" };
    }

    // Verify admin permissions
    const amIAdmin = !!myRoles?.some((r) => r.role_id === 1);
    if (!amIAdmin) return { success: false, message: "Forbidden" };

    // 4) Prevent self-deletion
    if (id === me.id) {
      console.error("[actions.deleteEmployee] self-deletion attempt");
      return { success: false, message: "Cannot delete your own account" };
    }

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

    if (targetEmployee.client_id !== me.client_id) {
      console.error("[actions.deleteEmployee] cross-client deletion attempt");
      return { success: false, message: "Forbidden: Different client" };
    }

    // 6) Create admin client using service role key
    const admin = createAdmin(
      import.meta.env.SUPABASE_URL!,
      import.meta.env.SUPABASE_KEY!,
      { auth: { persistSession: false } }
    );

    // 7) Delete role assignments first (foreign key constraint)
    const { error: deleteRoleErr } = await admin
      .from("roles-employees")
      .delete()
      .eq("employee_id", id);

    if (deleteRoleErr) {
      console.error("[actions.deleteEmployee] role deletion error:", deleteRoleErr.message);
      return { success: false, message: "Failed to remove role assignments" };
    }

    // 8) Delete employee record
    const { error: empDeleteErr } = await admin
      .from("employees")
      .delete()
      .eq("id", id);

    if (empDeleteErr) {
      console.error("[actions.deleteEmployee] employee deletion error:", empDeleteErr.message);
      return { success: false, message: "Failed to delete employee" };
    }

    // 9) Delete user from auth.users (optional - you might want to keep auth records)
    const { error: authDeleteErr } = await admin.auth.admin.deleteUser(targetEmployee.user_id);
    if (authDeleteErr) {
      console.warn("[actions.deleteEmployee] auth deletion warning:", authDeleteErr.message);
      // Don't fail the entire operation if auth deletion fails
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
    const {
      data: { user },
      error: userErr,
    } = await ssr.auth.getUser();
    if (userErr || !user) {
      console.error("[actions.updateCompany] getUser error:", userErr?.message);
      return { success: false, message: "Unauthorized" };
    }

    // 2) Employee und client_id ermitteln
    let me: { id: number; client_id: number } | null = null;
    try {
      const rpc = await ssr.rpc("get_my_employee").single();
      if (!rpc.error) me = rpc.data as any;
    } catch {}

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

    const amIAdmin = !!myRoles?.some((r) => r.role_id === 1);
    if (!amIAdmin) return { success: false, message: "Forbidden: Admin role required" };

    // 4) Nur die eigene Firma darf aktualisiert werden
    if (me.client_id !== id) {
      console.error("[actions.updateCompany] client mismatch", { mine: me.client_id, target: id });
      return { success: false, message: "Forbidden: Wrong company" };
    }

    // 5) Service-Role Client (Server-side)
    const admin = createAdmin(
      import.meta.env.SUPABASE_URL!,
      import.meta.env.SUPABASE_KEY!,
      { auth: { persistSession: false } }
    );

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
      return { success: false, message: "Company not found or update failed" };
    }

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
  try {
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) {
      // Allow anonymous draft sessions if you prefer. For now, require auth.
      return { success: false, message: "Unauthorized" };
    }

    const admin = createAdmin(import.meta.env.SUPABASE_URL!, import.meta.env.SUPABASE_KEY!, {
      auth: { persistSession: false },
    });

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

    if (error) return { success: false, message: error.message };
    return { success: true };
  } catch (e: any) {
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
  const ssr = createSSR({ request: context.request, cookies: context.cookies });

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

  // 2) If session missing, try sign-in
  if (!signUpRes.data.session) {
    const signInRes = await ssr.auth.signInWithPassword({ email, password });
    if (signInRes.error) {
      const msg = signInRes.error.message || signUpRes.error?.message || "Could not create session";
      return { success: false, message: msg };
    }
  }

  // 3) Persist registration session progress
  try {
    const admin = createAdmin(import.meta.env.SUPABASE_URL!, import.meta.env.SUPABASE_KEY!, {
      auth: { persistSession: false },
    });
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
  } catch {}

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
  const ssr = createSSR({ request: context.request, cookies: context.cookies });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return { success: false, message: "Unauthorized" };

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
    const rpc = await ssr.rpc("register_client_and_owner", { payload }).single();
    if (!rpc.error && rpc.data) {
      const clientData = rpc.data as { id: number; name: string };
      await upsertRegSession(reg_nonce, user.id, 2, {
        company: { id: clientData.id, name: clientData.name },
      });
      return { success: true, client_id: clientData.id };
    }
    // fallthrough if RPC failed
  } catch (e: any) {
    // continue to fallback
  }

  // 2) Fallback: perform inserts with service role (no true transaction)
  const admin = createAdmin(import.meta.env.SUPABASE_URL!, import.meta.env.SUPABASE_KEY!, {
    auth: { persistSession: false },
  });

  // Guard: if the user already belongs to a client, block
  const { data: existingEmp } = await admin
    .from("employees")
    .select("id, client_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingEmp?.client_id) {
    return { success: false, message: "You already belong to a company." };
  }

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
    return { success: false, message: clientErr?.message || "Failed to create company" };
  }

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
    // also ensure client_id is set
    await admin.from("employees").update({ client_id: clientRow.id }).eq("id", employeeId);
  } else {
    const { data: empRow, error: empErr } = await admin
      .from("employees")
      .insert({ user_id: user.id, client_id: clientRow.id, name: displayName || user.email })
      .select("id")
      .single();
    if (empErr || !empRow) {
      return { success: false, message: empErr?.message || "Failed to create employee" };
    }
    employeeId = empRow.id;
  }

  // Assign admin role (role_id = 1)
  await admin
    .from("roles-employees")
    .upsert({ employee_id: employeeId!, role_id: ADMIN_ROLE_ID }, { onConflict: "employee_id,role_id" });

  // Update registration session
  await upsertRegSession(reg_nonce, user.id, 2, {
    company: { id: clientRow.id, name: clientRow.name },
  });

  return { success: true, client_id: clientRow.id };
};

async function upsertRegSession(reg_nonce: string, user_id: string, last_step: number, extra: Record<string, any>) {
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
  } catch {}
}


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
      const supabase = createSSR({ request: context.request, cookies: context.cookies });
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("[actions.signOut] error:", error);
        return { success: false, message: error.message };
      }
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
};