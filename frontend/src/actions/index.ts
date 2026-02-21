import { defineAction, type ActionAPIContext } from "astro:actions";
import { z } from "astro:schema";
import { createClient as createSSR } from "../lib/supabase.ts";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { encrypt } from "../utils/encryption";
import { getApiUrl } from "../lib/api-config";
import { logger } from "../utils/logger";

/**
 * Fire-and-forget activity logging from frontend actions.
 * Calls the backend POST /api/activity-log endpoint.
 */
function logActivityFromAction(
  accessToken: string,
  data: {
    action: string;
    category: string;
    targetType?: string;
    targetId?: string;
    details?: Record<string, any>;
  }
) {
  const apiUrl = getApiUrl('/api');
  fetch(`${apiUrl}/activity-log`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(data),
  }).catch((err) => {
    logger.warn('activityLog', 'failed to log:', err?.message);
  });
}

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
  logger.debug("actions.signIn", "start");
  try {
    // Create Supabase client with SSR context
    const supabase = createSSR({
      request: context.request,
      cookies: context.cookies,
    });
    logger.debug("actions.signIn", "Supabase client created");

    // Attempt to sign in with email, password, and CAPTCHA token
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    });
    logger.debug("actions.signIn", "Sign-in attempt completed");

    // Handle sign-in errors
    if (error) {
      logger.error("actions.signIn", "error:", error);
      return { success: false, message: error.message };
    }

    logger.info("actions.signIn", "ok:", data?.user?.id);

    // Log activity
    if (data.session?.access_token) {
      logActivityFromAction(data.session.access_token, {
        action: 'auth.signed_in',
        category: 'auth',
      });
    }

    return { success: true, message: "Successfully logged in" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("actions.signIn", "unexpected:", message);
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
  logger.debug("actions.resetPassword", "start");
  try {
    // Create Supabase client with SSR context
    const supabase = createSSR({
      request: context.request,
      cookies: context.cookies,
    });
    logger.debug("actions.resetPassword", "Supabase client created");

    // Send password reset email with redirect URL
    const baseUrl = import.meta.env.PUBLIC_SITE_URL || 'http://localhost:4321';
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      captchaToken,
      redirectTo: `${baseUrl}/update-password`,
    });
    logger.debug("actions.resetPassword", "Password reset email attempt completed");

    // Handle reset email errors
    if (error) {
      logger.error("actions.resetPassword", "error:", error);
      return { success: false, message: error.message };
    }

    logger.info("actions.resetPassword", "ok:", data);
    return { success: true, message: "Password reset email sent" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("actions.resetPassword", "unexpected:", message);
    return { success: false, message: "Unexpected error" };
  }
};

/* ----------------------- UPDATE MY PROFILE (Self-Service) ----------------------- */

// Schema for validating profile update input
const updateMyProfileSchema = z.object({
  name: z.string().min(1).max(100),
  avatarBase64: z.string().optional().nullable(), // Base64-encoded WebP image data
});

type UpdateMyProfileInput = z.infer<typeof updateMyProfileSchema>;

/**
 * Self-service function for users to update their own profile
 * Updates name and avatar URL in the employees table
 * Avatar is uploaded server-side using admin client to bypass storage RLS
 */
const updateMyProfile = async (
  { name, avatarBase64 }: UpdateMyProfileInput,
  context: ActionAPIContext
) => {
  logger.debug("actions.updateMyProfile", "start");
  logger.debug("actions.updateMyProfile", `Input received - name: ${name}, hasAvatar: ${!!avatarBase64}`);
  try {
    // 1) Verify the current user is authenticated
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    logger.debug("actions.updateMyProfile", "SSR client created");
    
    const { data: { user }, error: userErr } = await ssr.auth.getUser();
    if (userErr || !user) {
      logger.error("actions.updateMyProfile", "getUser error:", userErr?.message);
      return { success: false, message: "Unauthorized" };
    }
    logger.debug("actions.updateMyProfile", "User authenticated:", user.id);

    // 2) Get current employee record
    const { data: me, error: meErr } = await ssr
      .from("employees")
      .select("id, client_id")
      .eq("user_id", user.id)
      .single();

    if (meErr || !me) {
      logger.error("actions.updateMyProfile", "employee lookup:", meErr?.message);
      return { success: false, message: "Employee not found" };
    }
    logger.debug("actions.updateMyProfile", "Employee found:", me.id);

    // 3) Use admin client to bypass RLS for storage and database updates
    const admin = createAdmin(
      import.meta.env.SUPABASE_URL!,
      import.meta.env.SUPABASE_KEY!,
      { auth: { persistSession: false } }
    );

    // 4) Upload avatar if provided
    let avatarPath: string | null = null;
    if (avatarBase64) {
      try {
        // Convert base64 to buffer
        const base64Data = avatarBase64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        
        // Generate file path: {client_id}/{employee_id}/avatar.webp
        const filePath = `${me.client_id}/${me.id}/avatar.webp`;
        
        logger.debug("actions.updateMyProfile", "Uploading avatar to:", filePath);
        
        const { error: uploadError } = await admin.storage
          .from("avatars")
          .upload(filePath, buffer, {
            contentType: "image/webp",
            upsert: true,
          });

        if (uploadError) {
          logger.error("actions.updateMyProfile", "Avatar upload error:", uploadError.message);
          return { success: false, message: "Failed to upload avatar: " + uploadError.message };
        }

        // Store the path (not public URL) - avatars bucket is private
        // Signed URLs will be generated on-demand when displaying avatars
        avatarPath = filePath;
        logger.debug("actions.updateMyProfile", "Avatar uploaded, path stored:", avatarPath);
      } catch (uploadErr: any) {
        logger.error("actions.updateMyProfile", "Avatar processing error:", uploadErr?.message);
        return { success: false, message: "Failed to process avatar" };
      }
    }

    // 5) Update employee record with name and avatar path
    const updateData: { name: string; avatar_url?: string } = { name };
    if (avatarPath) {
      updateData.avatar_url = avatarPath;
    }
    logger.debug("actions.updateMyProfile", "Update data:", JSON.stringify(updateData));

    const { data: updateResult, error: updateErr } = await admin
      .from("employees")
      .update(updateData)
      .eq("id", me.id)
      .select();

    if (updateErr) {
      logger.error("actions.updateMyProfile", "update error:", updateErr.message);
      return { success: false, message: "Failed to update profile" };
    }
    logger.debug("actions.updateMyProfile", "Update result:", JSON.stringify(updateResult));
    logger.info("actions.updateMyProfile", "Profile updated successfully");

    // Log activity
    try {
      const { data: { session: logSession } } = await ssr.auth.getSession();
      if (logSession?.access_token) {
        logActivityFromAction(logSession.access_token, {
          action: 'employee.profile_updated',
          category: 'employee_mgmt',
          targetType: 'employee',
          targetId: String(me.id),
          details: { name, hasAvatar: !!avatarBase64 },
        });
      }
    } catch {}

    return { success: true, message: "Profile updated successfully" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("actions.updateMyProfile", "unexpected:", message);
    return { success: false, message: "Unexpected error" };
  }
};

/* ----------------------- SEND PASSWORD RESET EMAIL (Self-Service) ----------------------- */

/**
 * Self-service function for authenticated users to request a password reset email
 * Does not require CAPTCHA since user is already authenticated
 */
const sendPasswordResetEmail = async (
  _input: {},
  context: ActionAPIContext
) => {
  logger.debug("actions.sendPasswordResetEmail", "start");
  try {
    // 1) Verify the current user is authenticated
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    
    const { data: { user }, error: userErr } = await ssr.auth.getUser();
    if (userErr || !user || !user.email) {
      logger.error("actions.sendPasswordResetEmail", "getUser error:", userErr?.message);
      return { success: false, message: "Unauthorized" };
    }
    logger.debug("actions.sendPasswordResetEmail", "User authenticated:", user.id);

    // 2) Send password reset email
    const baseUrl = import.meta.env.PUBLIC_SITE_URL || 'http://localhost:4321';
    const { error } = await ssr.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${baseUrl}/update-password`,
    });

    if (error) {
      logger.error("actions.sendPasswordResetEmail", "error:", error.message);
      return { success: false, message: error.message };
    }

    logger.info("actions.sendPasswordResetEmail", "Email sent to:", user.email);
    return { success: true, message: "Password reset email sent" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("actions.sendPasswordResetEmail", "unexpected:", message);
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
  logger.debug("actions.createEmployee", "start");
  try {
    // 1) Verify the current user is authenticated
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    logger.debug("actions.createEmployee", "SSR client created");
    
    const { data: { user }, error: userErr } = await ssr.auth.getUser();
    if (userErr || !user) {
      logger.error("actions.createEmployee", "getUser error:", userErr?.message);
      return { success: false, message: "Unauthorized" };
    }
    logger.debug("actions.createEmployee", `User authenticated: ${user.id}`);
  
    // 2) Get current employee record and client ID
    const { data: me, error: meErr } = await ssr
      .from("employees")
      .select("id, client_id")
      .eq("user_id", user.id)
      .single();

    if (meErr || !me) {
      logger.error("actions.createEmployee", "employees lookup:", meErr?.message);
      return { success: false, message: "Forbidden" };
    }
    logger.debug("actions.createEmployee", `Current employee found: ${me.id}, client: ${me.client_id}`);

    // 3) Check if current user has admin role (role_id = 1)
    const { data: myRoles, error: rolesErr } = await ssr
      .from("roles-employees")
      .select("role_id")
      .eq("employee_id", me.id);

    if (rolesErr) {
      logger.error("actions.createEmployee", "roles lookup:", rolesErr.message);
      return { success: false, message: "Forbidden" };
    }
    logger.debug("actions.createEmployee", "User roles:", myRoles);

    // Verify admin permissions
    const amIAdmin = !!myRoles?.some((r) => r.role_id === 1);
    if (!amIAdmin) {
      logger.error("actions.createEmployee", "User is not admin");
      return { success: false, message: "Forbidden" };
    }
    logger.debug("actions.createEmployee", "Admin permissions verified");

    // 4) Create admin client using service role key (server-side only!)
    const admin = createAdmin(
      import.meta.env.SUPABASE_URL!,
      import.meta.env.SUPABASE_KEY!,
      { auth: { persistSession: false } }
    );
    logger.debug("actions.createEmployee", "Admin client created");

    // 5) Create new user in auth.users table
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: false, // User will confirm via reset password email
      user_metadata: { name },
    });
    if (createErr) {
      logger.error("actions.createEmployee", "createUser:", createErr.message);
      return { success: false, message: createErr.message };
    }
    logger.debug("actions.createEmployee", `User created in auth: ${created.user.id}`);

    // 6) Create employee record in same client/organization
    const { data: empRow, error: empErr } = await admin
      .from("employees")
      .insert({ user_id: created.user.id, client_id: me.client_id, name })
      .select("id")
      .single();
    if (empErr) {
      logger.error("actions.createEmployee", "insert employees:", empErr.message);
      return { success: false, message: empErr.message };
    }
    logger.debug("actions.createEmployee", `Employee record created: ${empRow.id}`);

    // 7) Assign role to the new employee
    const { error: relErr } = await admin
      .from("roles-employees")
      .insert({ role_id, employee_id: empRow.id });
    if (relErr) {
      logger.error("actions.createEmployee", "insert roles-employees:", relErr.message);
      return { success: false, message: relErr.message };
    }
    logger.debug("actions.createEmployee", `Role assigned: ${role_id}`);

    // 8) Send password reset email as account activation
    await admin.auth.resetPasswordForEmail(email, {
      redirectTo: new URL("/update-password", context.request.url).toString(),
    });
    logger.debug("actions.createEmployee", "Activation email sent");

    // 9) Update Stripe subscription quantity (if on paid plan)
    try {
      // Get total ACTIVE employee count for this client
      const { count: employeeCount } = await admin
        .from("employees")
        .select("*", { count: "exact", head: true })
        .eq("client_id", me.client_id)
        .or("disabled.is.null,disabled.eq.false"); // Only count non-disabled users

      const newQuantity = employeeCount || 1;
      logger.debug("actions.createEmployee", `Updating subscription quantity to: ${newQuantity}`);

      // Call backend to update Stripe subscription
      const apiUrl = getApiUrl('/api');
      const { data: { session: userSession } } = await ssr.auth.getSession();
      
      if (userSession?.access_token) {
        const response = await fetch(`${apiUrl}/client/update-subscription-quantity`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userSession.access_token}`
          },
          body: JSON.stringify({ quantity: newQuantity })
        });

        const result = await response.json();
        if (result.success) {
          logger.debug("actions.createEmployee", "Subscription quantity updated");
        } else {
          logger.warn("actions.createEmployee", "Failed to update subscription:", result.error);
        }
      }
    } catch (stripeErr: any) {
      logger.warn("actions.createEmployee", "Stripe update warning:", stripeErr?.message);
      // Don't fail the entire operation if subscription update fails
    }

    logger.info("actions.createEmployee", "ok");

    // Log activity
    try {
      const { data: { session: logSession } } = await ssr.auth.getSession();
      if (logSession?.access_token) {
        logActivityFromAction(logSession.access_token, {
          action: 'employee.created',
          category: 'employee_mgmt',
          targetType: 'employee',
          targetId: String(empRow.id),
          details: { email, name, role_id },
        });
      }
    } catch {}

    return { success: true, message: "Employee created and invite sent" };
  } catch (e: any) {
    logger.error("actions.createEmployee", "unexpected:", e?.message ?? e);
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
  logger.debug("actions.updateEmployee", `start for employee: ${id}`);
  try {
    // 1) Verify the current user is authenticated
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    logger.debug("actions.updateEmployee", "SSR client created");
    
    const { data: { user }, error: userErr } = await ssr.auth.getUser();
    if (userErr || !user) {
      logger.error("actions.updateEmployee", "getUser error:", userErr?.message);
      return { success: false, message: "Unauthorized" };
    }
    logger.debug("actions.updateEmployee", `User authenticated: ${user.id}`);
  
    // 2) Get current employee record and client ID
    const { data: me, error: meErr } = await ssr
      .from("employees")
      .select("id, client_id")
      .eq("user_id", user.id)
      .single();

    if (meErr || !me) {
      logger.error("actions.updateEmployee", "employees lookup:", meErr?.message);
      return { success: false, message: "Forbidden" };
    }
    logger.debug("actions.updateEmployee", `Current employee found: ${me.id}, client: ${me.client_id}`);

    // 3) Check if current user has admin role (role_id = 1)
    const { data: myRoles, error: rolesErr } = await ssr
      .from("roles-employees")
      .select("role_id")
      .eq("employee_id", me.id);

    if (rolesErr) {
      logger.error("actions.updateEmployee", "roles lookup:", rolesErr.message);
      return { success: false, message: "Forbidden" };
    }
    logger.debug("actions.updateEmployee", "User roles:", myRoles);

    // Verify admin permissions
    const amIAdmin = !!myRoles?.some((r) => r.role_id === 1);
    if (!amIAdmin) {
      logger.error("actions.updateEmployee", "User is not admin");
      return { success: false, message: "Forbidden" };
    }
    logger.debug("actions.updateEmployee", "Admin permissions verified");

    // 4) Verify target employee belongs to same client
    const { data: targetEmployee, error: targetErr } = await ssr
      .from("employees")
      .select("user_id, client_id")
      .eq("id", id)
      .single();

    if (targetErr || !targetEmployee) {
      logger.error("actions.updateEmployee", "target employee lookup:", targetErr?.message);
      return { success: false, message: "Employee not found" };
    }
    logger.debug("actions.updateEmployee", `Target employee found: ${targetEmployee.user_id}, client: ${targetEmployee.client_id}`);

    if (targetEmployee.client_id !== me.client_id) {
      logger.error("actions.updateEmployee", "cross-client update attempt");
      return { success: false, message: "Forbidden: Different client" };
    }
    logger.debug("actions.updateEmployee", "Client verification passed");

    // 5) Create admin client using service role key
    const admin = createAdmin(
      import.meta.env.SUPABASE_URL!,
      import.meta.env.SUPABASE_KEY!,
      { auth: { persistSession: false } }
    );
    logger.debug("actions.updateEmployee", "Admin client created");

    // 6) Update user email and metadata in auth.users
    const { error: authUpdateErr } = await admin.auth.admin.updateUserById(
      targetEmployee.user_id,
      {
        email,
        user_metadata: { name },
      }
    );
    if (authUpdateErr) {
      logger.error("actions.updateEmployee", "auth update error:", authUpdateErr.message);
      return { success: false, message: "Failed to update user auth data" };
    }
    logger.debug("actions.updateEmployee", "Auth data updated");

    // 7) Update employee name
    const { error: empUpdateErr } = await admin
      .from("employees")
      .update({ name })
      .eq("id", id);

    if (empUpdateErr) {
      logger.error("actions.updateEmployee", "employee update error:", empUpdateErr.message);
      return { success: false, message: "Failed to update employee data" };
    }
    logger.debug("actions.updateEmployee", "Employee data updated");

    // 8) Update role assignment
    // First delete existing role assignments for this employee
    const { error: deleteRoleErr } = await admin
      .from("roles-employees")
      .delete()
      .eq("employee_id", id);

    if (deleteRoleErr) {
      logger.error("actions.updateEmployee", "role deletion error:", deleteRoleErr.message);
      return { success: false, message: "Failed to update role assignments" };
    }
    logger.debug("actions.updateEmployee", "Old roles deleted");

    // Then insert new role
    const { error: insertRoleErr } = await admin
      .from("roles-employees")
      .insert({ role_id, employee_id: id });

    if (insertRoleErr) {
      logger.error("actions.updateEmployee", "role insertion error:", insertRoleErr.message);
      return { success: false, message: "Failed to assign new role" };
    }
    logger.debug("actions.updateEmployee", `New role assigned: ${role_id}`);

    logger.info("actions.updateEmployee", "ok");

    // Log activity
    try {
      const { data: { session: logSession } } = await ssr.auth.getSession();
      if (logSession?.access_token) {
        logActivityFromAction(logSession.access_token, {
          action: 'employee.updated',
          category: 'employee_mgmt',
          targetType: 'employee',
          targetId: String(id),
          details: { name, role_id },
        });
      }
    } catch {}

    return { success: true, message: "Employee updated successfully" };
  } catch (e: any) {
    logger.error("actions.updateEmployee", "unexpected:", e?.message ?? e);
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
  logger.debug("actions.deleteEmployee", `start for employee: ${id}`);
  try {
    // 1) Verify the current user is authenticated
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    logger.debug("actions.deleteEmployee", "SSR client created");
    
    const { data: { user }, error: userErr } = await ssr.auth.getUser();
    if (userErr || !user) {
      logger.error("actions.deleteEmployee", "getUser error:", userErr?.message);
      return { success: false, message: "Unauthorized" };
    }
    logger.debug("actions.deleteEmployee", `User authenticated: ${user.id}`);
  
    // 2) Get current employee record and client ID
    const { data: me, error: meErr } = await ssr
      .from("employees")
      .select("id, client_id")
      .eq("user_id", user.id)
      .single();

    if (meErr || !me) {
      logger.error("actions.deleteEmployee", "employees lookup:", meErr?.message);
      return { success: false, message: "Forbidden" };
    }
    logger.debug("actions.deleteEmployee", `Current employee found: ${me.id}, client: ${me.client_id}`);

    // 3) Check if current user has admin role (role_id = 1)
    const { data: myRoles, error: rolesErr } = await ssr
      .from("roles-employees")
      .select("role_id")
      .eq("employee_id", me.id);

    if (rolesErr) {
      logger.error("actions.deleteEmployee", "roles lookup:", rolesErr.message);
      return { success: false, message: "Forbidden" };
    }
    logger.debug("actions.deleteEmployee", "User roles:", myRoles);

    // Verify admin permissions
    const amIAdmin = !!myRoles?.some((r) => r.role_id === 1);
    if (!amIAdmin) {
      logger.error("actions.deleteEmployee", "User is not admin");
      return { success: false, message: "Forbidden" };
    }
    logger.debug("actions.deleteEmployee", "Admin permissions verified");

    // 4) Prevent self-deletion
    if (id === me.id) {
      logger.error("actions.deleteEmployee", "self-deletion attempt");
      return { success: false, message: "Cannot delete your own account" };
    }
    logger.debug("actions.deleteEmployee", "Self-deletion check passed");

    // 5) Verify target employee belongs to same client
    const { data: targetEmployee, error: targetErr } = await ssr
      .from("employees")
      .select("user_id, client_id")
      .eq("id", id)
      .single();

    if (targetErr || !targetEmployee) {
      logger.error("actions.deleteEmployee", "target employee lookup:", targetErr?.message);
      return { success: false, message: "Employee not found" };
    }
    logger.debug("actions.deleteEmployee", `Target employee found: ${targetEmployee.user_id}, client: ${targetEmployee.client_id}`);

    if (targetEmployee.client_id !== me.client_id) {
      logger.error("actions.deleteEmployee", "cross-client deletion attempt");
      return { success: false, message: "Forbidden: Different client" };
    }
    logger.debug("actions.deleteEmployee", "Client verification passed");

    // 6) Create admin client using service role key
    const admin = createAdmin(
      import.meta.env.SUPABASE_URL!,
      import.meta.env.SUPABASE_KEY!,
      { auth: { persistSession: false } }
    );
    logger.debug("actions.deleteEmployee", "Admin client created");

    // 7) Delete role assignments first (foreign key constraint)
    const { error: deleteRoleErr } = await admin
      .from("roles-employees")
      .delete()
      .eq("employee_id", id);

    if (deleteRoleErr) {
      logger.error("actions.deleteEmployee", "role deletion error:", deleteRoleErr.message);
      return { success: false, message: "Failed to remove role assignments" };
    }
    logger.debug("actions.deleteEmployee", "Role assignments deleted");

    // 8) Delete employee record
    const { error: empDeleteErr } = await admin
      .from("employees")
      .delete()
      .eq("id", id);

    if (empDeleteErr) {
      logger.error("actions.deleteEmployee", "employee deletion error:", empDeleteErr.message);
      return { success: false, message: "Failed to delete employee" };
    }
    logger.debug("actions.deleteEmployee", "Employee record deleted");

    // 9) Delete user from auth.users (optional - you might want to keep auth records)
    const { error: authDeleteErr } = await admin.auth.admin.deleteUser(targetEmployee.user_id);
    if (authDeleteErr) {
      logger.warn("actions.deleteEmployee", "auth deletion warning:", authDeleteErr.message);
      // Don't fail the entire operation if auth deletion fails
    } else {
      logger.debug("actions.deleteEmployee", "Auth user deleted");
    }

    // 10) Update Stripe subscription quantity (if on paid plan)
    try {
      // Get total ACTIVE employee count for this client (after deletion)
      const { count: employeeCount } = await admin
        .from("employees")
        .select("*", { count: "exact", head: true })
        .eq("client_id", me.client_id)
        .or("disabled.is.null,disabled.eq.false"); // Only count non-disabled users

      const newQuantity = Math.max(employeeCount || 1, 1); // Minimum 1 user
      logger.debug("actions.deleteEmployee", `Updating subscription quantity to: ${newQuantity}`);

      // Call backend to update Stripe subscription
      const apiUrl = getApiUrl('/api');
      const { data: { session: userSession } } = await ssr.auth.getSession();
      
      if (userSession?.access_token) {
        const response = await fetch(`${apiUrl}/client/update-subscription-quantity`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userSession.access_token}`
          },
          body: JSON.stringify({ quantity: newQuantity })
        });

        const result = await response.json();
        if (result.success) {
          logger.debug("actions.deleteEmployee", "Subscription quantity updated");
        } else {
          logger.warn("actions.deleteEmployee", "Failed to update subscription:", result.error);
        }
      }
    } catch (stripeErr: any) {
      logger.warn("actions.deleteEmployee", "Stripe update warning:", stripeErr?.message);
      // Don't fail the entire operation if subscription update fails
    }

    logger.info("actions.deleteEmployee", "ok");

    // Log activity
    try {
      const { data: { session: logSession } } = await ssr.auth.getSession();
      if (logSession?.access_token) {
        logActivityFromAction(logSession.access_token, {
          action: 'employee.deleted',
          category: 'employee_mgmt',
          targetType: 'employee',
          targetId: String(id),
        });
      }
    } catch {}

    return { success: true, message: "Employee deleted successfully" };
  } catch (e: any) {
    logger.error("actions.deleteEmployee", "unexpected:", e?.message ?? e);
    return { success: false, message: "Unexpected error" };
  }
};

/* ----------------------- ADMIN: DISABLE EMPLOYEE ----------------------- */

const disableEmployeeSchema = z.object({
  id: z.coerce.number().int().positive(),
});

type DisableEmployeeInput = z.infer<typeof disableEmployeeSchema>;

/**
 * Admin-only function to disable employees
 * Disabled users cannot log in and don't count towards subscription
 */
const disableEmployee = async (
  { id }: DisableEmployeeInput,
  context: ActionAPIContext
) => {
  logger.debug("actions.disableEmployee", `start for employee: ${id}`);
  try {
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    const { data: { user }, error: userErr } = await ssr.auth.getUser();
    if (userErr || !user) {
      return { success: false, message: "Unauthorized" };
    }

    const { data: me, error: meErr } = await ssr
      .from("employees")
      .select("id, client_id")
      .eq("user_id", user.id)
      .single();

    if (meErr || !me) {
      return { success: false, message: "Forbidden" };
    }

    const { data: myRoles, error: rolesErr } = await ssr
      .from("roles-employees")
      .select("role_id")
      .eq("employee_id", me.id);

    if (rolesErr || !myRoles?.some((r) => r.role_id === 1)) {
      return { success: false, message: "Forbidden" };
    }

    if (id === me.id) {
      return { success: false, message: "Cannot disable your own account" };
    }

    const { data: targetEmployee, error: targetErr } = await ssr
      .from("employees")
      .select("user_id, client_id")
      .eq("id", id)
      .single();

    if (targetErr || !targetEmployee || targetEmployee.client_id !== me.client_id) {
      return { success: false, message: "Employee not found" };
    }

    const admin = createAdmin(
      import.meta.env.SUPABASE_URL!,
      import.meta.env.SUPABASE_KEY!,
      { auth: { persistSession: false } }
    );

    // Set disabled flag in employees table
    const { error: updateErr } = await admin
      .from("employees")
      .update({ disabled: true })
      .eq("id", id);

    if (updateErr) {
      logger.error("actions.disableEmployee", "update error:", updateErr.message);
      return { success: false, message: "Failed to disable employee" };
    }

    // Ban user in Supabase Auth
    const { error: banErr } = await admin.auth.admin.updateUserById(
      targetEmployee.user_id,
      { ban_duration: "876000h" } // ~100 years = effectively permanent
    );

    if (banErr) {
      logger.warn("actions.disableEmployee", "ban error:", banErr.message);
    }

    // Update subscription quantity (exclude disabled users)
    try {
      const { count: activeCount } = await admin
        .from("employees")
        .select("*", { count: "exact", head: true })
        .eq("client_id", me.client_id)
        .or("disabled.is.null,disabled.eq.false");

      const newQuantity = Math.max(activeCount || 1, 1);
      const apiUrl = getApiUrl('/api');
      const { data: { session: userSession } } = await ssr.auth.getSession();
      
      if (userSession?.access_token) {
        await fetch(`${apiUrl}/client/update-subscription-quantity`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userSession.access_token}`
          },
          body: JSON.stringify({ quantity: newQuantity })
        });
      }
    } catch (stripeErr: any) {
      logger.warn("actions.disableEmployee", "Stripe update warning:", stripeErr?.message);
    }

    // Log activity
    try {
      const { data: { session: logSession } } = await ssr.auth.getSession();
      if (logSession?.access_token) {
        logActivityFromAction(logSession.access_token, {
          action: 'employee.disabled',
          category: 'employee_mgmt',
          targetType: 'employee',
          targetId: String(id),
        });
      }
    } catch {}

    return { success: true, message: "Employee disabled successfully" };
  } catch (e: any) {
    logger.error("actions.disableEmployee", "unexpected:", e?.message ?? e);
    return { success: false, message: "Unexpected error" };
  }
};

/* ----------------------- ADMIN: ENABLE EMPLOYEE ----------------------- */

const enableEmployeeSchema = z.object({
  id: z.coerce.number().int().positive(),
});

type EnableEmployeeInput = z.infer<typeof enableEmployeeSchema>;

/**
 * Admin-only function to enable disabled employees
 */
const enableEmployee = async (
  { id }: EnableEmployeeInput,
  context: ActionAPIContext
) => {
  logger.debug("actions.enableEmployee", `start for employee: ${id}`);
  try {
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    const { data: { user }, error: userErr } = await ssr.auth.getUser();
    if (userErr || !user) {
      return { success: false, message: "Unauthorized" };
    }

    const { data: me, error: meErr } = await ssr
      .from("employees")
      .select("id, client_id")
      .eq("user_id", user.id)
      .single();

    if (meErr || !me) {
      return { success: false, message: "Forbidden" };
    }

    const { data: myRoles, error: rolesErr } = await ssr
      .from("roles-employees")
      .select("role_id")
      .eq("employee_id", me.id);

    if (rolesErr || !myRoles?.some((r) => r.role_id === 1)) {
      return { success: false, message: "Forbidden" };
    }

    const { data: targetEmployee, error: targetErr } = await ssr
      .from("employees")
      .select("user_id, client_id")
      .eq("id", id)
      .single();

    if (targetErr || !targetEmployee || targetEmployee.client_id !== me.client_id) {
      return { success: false, message: "Employee not found" };
    }

    const admin = createAdmin(
      import.meta.env.SUPABASE_URL!,
      import.meta.env.SUPABASE_KEY!,
      { auth: { persistSession: false } }
    );

    // Remove disabled flag
    const { error: updateErr } = await admin
      .from("employees")
      .update({ disabled: false })
      .eq("id", id);

    if (updateErr) {
      logger.error("actions.enableEmployee", "update error:", updateErr.message);
      return { success: false, message: "Failed to enable employee" };
    }

    // Unban user in Supabase Auth
    const { error: unbanErr } = await admin.auth.admin.updateUserById(
      targetEmployee.user_id,
      { ban_duration: "none" }
    );

    if (unbanErr) {
      logger.warn("actions.enableEmployee", "unban error:", unbanErr.message);
    }

    // Update subscription quantity (include newly enabled user)
    try {
      const { count: activeCount } = await admin
        .from("employees")
        .select("*", { count: "exact", head: true })
        .eq("client_id", me.client_id)
        .or("disabled.is.null,disabled.eq.false");

      const newQuantity = Math.max(activeCount || 1, 1);
      const apiUrl = getApiUrl('/api');
      const { data: { session: userSession } } = await ssr.auth.getSession();
      
      if (userSession?.access_token) {
        await fetch(`${apiUrl}/client/update-subscription-quantity`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userSession.access_token}`
          },
          body: JSON.stringify({ quantity: newQuantity })
        });
      }
    } catch (stripeErr: any) {
      logger.warn("actions.enableEmployee", "Stripe update warning:", stripeErr?.message);
    }

    // Log activity
    try {
      const { data: { session: logSession } } = await ssr.auth.getSession();
      if (logSession?.access_token) {
        logActivityFromAction(logSession.access_token, {
          action: 'employee.enabled',
          category: 'employee_mgmt',
          targetType: 'employee',
          targetId: String(id),
        });
      }
    } catch {}

    return { success: true, message: "Employee enabled successfully" };
  } catch (e: any) {
    logger.error("actions.enableEmployee", "unexpected:", e?.message ?? e);
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
  logger.debug("actions.updateCompany", `start for company: ${id}`);
  try {
    // 1) User prüfen
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    logger.debug("actions.updateCompany", "SSR client created");
    
    const {
      data: { user },
      error: userErr,
    } = await ssr.auth.getUser();
    if (userErr || !user) {
      logger.error("actions.updateCompany", "getUser error:", userErr?.message);
      return { success: false, message: "Unauthorized" };
    }
    logger.debug("actions.updateCompany", `User authenticated: ${user.id}`);

    // 2) Employee und client_id ermitteln
    let me: { id: number; client_id: number } | null = null;
    try {
      const rpc = await ssr.rpc("get_my_employee").single();
      if (!rpc.error) {
        me = rpc.data as any;
        logger.debug("actions.updateCompany", "Employee found via RPC:", me);
      }
    } catch (e) {
      logger.debug("actions.updateCompany", "RPC fallback failed, trying direct query");
    }

    if (!me) {
      const { data: empData, error: meErr } = await ssr
        .from("employees")
        .select("id, client_id")
        .eq("user_id", user.id)
        .single();
      me = empData as any;
      if (meErr || !me) {
        logger.error("actions.updateCompany", "employees lookup:", meErr?.message);
        return { success: false, message: "Unauthorized" };
      }
      logger.debug("actions.updateCompany", "Employee found via direct query:", me);
    }

    // 3) Rollen prüfen
    const { data: myRoles, error: rolesErr } = await ssr
      .from("roles-employees")
      .select("role_id")
      .eq("employee_id", me.id);

    if (rolesErr) {
      logger.error("actions.updateCompany", "roles lookup:", rolesErr.message);
      return { success: false, message: "Forbidden" };
    }
    logger.debug("actions.updateCompany", "User roles:", myRoles);

    const amIAdmin = !!myRoles?.some((r) => r.role_id === 1);
    if (!amIAdmin) {
      logger.error("actions.updateCompany", "User is not admin");
      return { success: false, message: "Forbidden: Admin role required" };
    }
    logger.debug("actions.updateCompany", "Admin permissions verified");

    // 4) Nur die eigene Firma darf aktualisiert werden
    if (me.client_id !== id) {
      logger.error("actions.updateCompany", `client mismatch - mine: ${me.client_id}, target: ${id}`);
      return { success: false, message: "Forbidden: Wrong company" };
    }
    logger.debug("actions.updateCompany", "Company ownership verified");

    // 5) Service-Role Client (Server-side)
    const admin = createAdmin(
      import.meta.env.SUPABASE_URL!,
      import.meta.env.SUPABASE_KEY!,
      { auth: { persistSession: false } }
    );
    logger.debug("actions.updateCompany", "Admin client created");

    // 5.5) Get current client data for Stripe sync
    const { data: currentClient } = await admin
      .from("clients")
      .select("stripe_customer_id, address_street, address_city, address_zip, address_country")
      .eq("id", id)
      .single();

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
    logger.debug("actions.updateCompany", "Update payload prepared:", payload);

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
      logger.error("actions.updateCompany", "update error:", error.message);
      return { success: false, message: `Database error: ${error.message}` };
    }

    if (!data) {
      logger.error("actions.updateCompany", "No data returned from update");
      return { success: false, message: "Company not found or update failed" };
    }
    logger.debug("actions.updateCompany", "Company updated:", data);

    // 8) Sync changes to Stripe customer profile
    if (currentClient?.stripe_customer_id) {
      try {
        const apiUrl = getApiUrl('/api');
        const { data: { session: userSession } } = await ssr.auth.getSession();
        
        if (userSession?.access_token) {
          const stripeUpdates: Record<string, any> = { name };
          
          // Build address object for Stripe
          stripeUpdates.address = {
            line1: address_street ?? currentClient.address_street ?? '',
            city: address_city ?? currentClient.address_city ?? '',
            postal_code: address_zip ?? currentClient.address_zip ?? '',
            country: address_country ?? currentClient.address_country ?? ''
          };

          logger.debug("actions.updateCompany", "Syncing to Stripe:", stripeUpdates);
          
          const response = await fetch(`${apiUrl}/client/sync-stripe-customer`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${userSession.access_token}`
            },
            body: JSON.stringify(stripeUpdates)
          });

          const result = await response.json();
          if (result.success) {
            logger.debug("actions.updateCompany", "Stripe customer synced");
          } else {
            logger.warn("actions.updateCompany", "Failed to sync Stripe:", result.error);
          }
        }
      } catch (stripeErr: any) {
        logger.warn("actions.updateCompany", "Stripe sync warning:", stripeErr?.message);
        // Don't fail the entire operation if Stripe sync fails
      }
    }

    logger.info("actions.updateCompany", "ok");

    // Log activity
    try {
      const { data: { session: logSession } } = await ssr.auth.getSession();
      if (logSession?.access_token) {
        logActivityFromAction(logSession.access_token, {
          action: 'company.updated',
          category: 'settings',
          targetType: 'client',
          targetId: String(id),
          details: { name },
        });
      }
    } catch {}

    return {
      success: true,
      message: "Company updated successfully",
      data,
    };
  } catch (e: any) {
    logger.error("actions.updateCompany", "unexpected:", e?.message ?? e);
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
  logger.debug("actions.saveRegistrationProgress", "start", { reg_nonce, step });
  try {
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    logger.debug("actions.saveRegistrationProgress", "SSR client created");
    
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) {
      logger.error("actions.saveRegistrationProgress", "No authenticated user");
      // Allow anonymous draft sessions if you prefer. For now, require auth.
      return { success: false, message: "Unauthorized" };
    }
    logger.debug("actions.saveRegistrationProgress", `User authenticated: ${user.id}`);

    const admin = createAdmin(import.meta.env.SUPABASE_URL!, import.meta.env.SUPABASE_KEY!, {
      auth: { persistSession: false },
    });
    logger.debug("actions.saveRegistrationProgress", "Admin client created");

    // Security check: Verify nonce ownership before upsert
    // Fetch existing session for this nonce
    const { data: existingSession } = await admin
      .from("registration_sessions")
      .select("user_id")
      .eq("reg_nonce", reg_nonce)
      .maybeSingle();

    // If session exists and user_id doesn't match the current authenticated user, abort
    if (existingSession && existingSession.user_id !== user.id) {
      logger.error("actions.saveRegistrationProgress", `Security violation: IDOR attempt on reg_nonce - nonce: ${reg_nonce}, owner: ${existingSession.user_id}, requester: ${user.id}`);
      return { success: false, message: "Invalid session" };
    }

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
      logger.error("actions.saveRegistrationProgress", "upsert error:", error.message);
      return { success: false, message: error.message };
    }
    
    logger.debug("actions.saveRegistrationProgress", "Registration progress saved");
    return { success: true };
  } catch (e: any) {
    logger.error("actions.saveRegistrationProgress", "unexpected:", e?.message ?? e);
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
  logger.debug("actions.registerCreateAccount", "start", { reg_nonce, email });
  const ssr = createSSR({ request: context.request, cookies: context.cookies });
  logger.debug("actions.registerCreateAccount", "SSR client created");

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
  logger.debug("actions.registerCreateAccount", "Sign up attempt completed");

  // 2) Handle signup errors
  if (signUpRes.error) {
    logger.error("actions.registerCreateAccount", "Signup error:", signUpRes.error.message);
    // If user already exists, return specific error
    if (signUpRes.error.message.includes("already registered") || signUpRes.error.message.includes("already exists")) {
      return { success: false, message: "An account with this email already exists. Please sign in instead." };
    }
    return { success: false, message: signUpRes.error.message };
  }

  // 3) If no session was created, something went wrong
  if (!signUpRes.data.session && !signUpRes.data.user) {
    logger.error("actions.registerCreateAccount", "No session or user created");
    return { success: false, message: "Failed to create account. Please try again." };
  }

  logger.debug("actions.registerCreateAccount", "Account created successfully");

  // 3) Persist registration session progress
  try {
    const admin = createAdmin(import.meta.env.SUPABASE_URL!, import.meta.env.SUPABASE_KEY!, {
      auth: { persistSession: false },
    });
    logger.debug("actions.registerCreateAccount", "Admin client created for session persistence");
    
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
    logger.debug("actions.registerCreateAccount", "Registration session persisted");
  } catch (e: any) {
    logger.warn("actions.registerCreateAccount", "Session persistence failed:", e?.message);
  }

  logger.info("actions.registerCreateAccount", "ok");
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
  logger.debug("actions.registerCreateCompany", "start", { reg_nonce, name });
  const ssr = createSSR({ request: context.request, cookies: context.cookies });
  logger.debug("actions.registerCreateCompany", "SSR client created");
  
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) {
    logger.error("actions.registerCreateCompany", "No authenticated user");
    return { success: false, message: "Unauthorized" };
  }
  logger.debug("actions.registerCreateCompany", `User authenticated: ${user.id}`);

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
    logger.debug("actions.registerCreateCompany", "Attempting RPC with payload:", payload);
    
    const rpc = await ssr.rpc("register_client_and_owner", { payload }).single();
    if (!rpc.error && rpc.data) {
      const clientData = rpc.data as { id: number; name: string };
      logger.debug("actions.registerCreateCompany", "RPC successful, client created:", clientData);
      
      await upsertRegSession(reg_nonce, user.id, 2, {
        company: { id: clientData.id, name: clientData.name },
      });
      logger.debug("actions.registerCreateCompany", "Registration session updated via RPC path");
      
      return { success: true, client_id: clientData.id };
    }
    
    // If RPC fails, return error immediately - do NOT attempt fallback
    logger.error("actions.registerCreateCompany", "RPC failed:", rpc.error);
    return { 
      success: false, 
      message: "Failed to create company. Please try again or contact support." 
    };

  } catch (e: any) {
    logger.error("actions.registerCreateCompany", "RPC exception:", e?.message);
    return { success: false, message: "Unexpected error during registration" };
  }
};

/* 
 * HELPER: Upsert Registration Session
 */
async function upsertRegSession(reg_nonce: string, user_id: string, last_step: number, extra: Record<string, any>) {
  logger.debug("upsertRegSession", "start", { reg_nonce, user_id, last_step });
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
    logger.debug("upsertRegSession", "Registration session upserted successfully");
  } catch (e: any) {
    logger.error("upsertRegSession", "Failed to upsert registration session:", e?.message);
  }
}

async function createStripeCustomerForClient(
  user: any,
  client_id: number,
  clientData: {
    email?: string;
    name: string;
    address_street: string;
    address_zip: string;
    address_city: string;
    address_country: string;
    vat?: string;
  }
) {
  logger.debug("createStripeCustomerForClient", "start", { client_id, name: clientData.name });
  
  // Only attempt Stripe creation if API key is configured
  if (!import.meta.env.STRIPE_SECRET_KEY) {
    logger.warn("createStripeCustomerForClient", "Stripe secret key not configured, skipping");
    return;
  }

  try {
    // Dynamic import to avoid issues if Stripe isn't installed
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-11-20.acacia' as any,
    });

    const customerData: any = {
      email: clientData.email || user.email,
      name: clientData.name,
      metadata: {
        client_id: client_id.toString(),
        created_via: 'registration_flow',
      },
    };

    // Add address if all required fields are present
    if (
      clientData.address_street &&
      clientData.address_city &&
      clientData.address_zip &&
      clientData.address_country
    ) {
      customerData.address = {
        line1: clientData.address_street,
        city: clientData.address_city,
        postal_code: clientData.address_zip,
        country: clientData.address_country,
      };

      customerData.shipping = {
        name: clientData.name,
        address: {
          line1: clientData.address_street,
          city: clientData.address_city,
          postal_code: clientData.address_zip,
          country: clientData.address_country,
        },
      };
    }

    // Add VAT number if present
    if (clientData.vat) {
      customerData.metadata.vat_number = clientData.vat;
    }

    const customer = await stripe.customers.create(customerData);
    logger.debug("createStripeCustomerForClient", `Stripe customer created: ${customer.id}`);

    // Update client record with Stripe customer ID
    const admin = createAdmin(import.meta.env.SUPABASE_URL!, import.meta.env.SUPABASE_KEY!, {
      auth: { persistSession: false },
    });

    const { error: updateError } = await admin
      .from('clients')
      .update({ stripe_customer_id: customer.id })
      .eq('id', client_id);

    if (updateError) {
      logger.error("createStripeCustomerForClient", "Failed to save Stripe ID to database:", updateError.message);
      // Stripe customer was created but we couldn't save the ID
      // This should be handled manually later
    } else {
      logger.debug("createStripeCustomerForClient", "Stripe customer ID saved to database");
    }

    logger.debug("createStripeCustomerForClient", `Stripe customer created: ${customer.id}`);
  } catch (e: any) {
    logger.error("createStripeCustomerForClient", "Error creating Stripe customer:", e?.message);
    // Don't fail registration if Stripe integration fails
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
  const { data: { session } } = await ssr.auth.getSession();
  
  if (!session?.access_token) {
    return { success: false, message: "Unauthorized" };
  }

  try {
    const apiUrl = import.meta.env.PUBLIC_API_URL || 'http://localhost:3000/api';
    const response = await fetch(`${apiUrl}/email-accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(input),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      return { 
        success: false, 
        message: result.error || result.message || "Failed to create mailbox" 
      };
    }

    return { 
      success: true, 
      client_email_id: result.data.id 
    };
  } catch (e: any) {
    logger.error("actions.registerCreateSupportMailbox", "Error:", e);
    return { success: false, message: e.message };
  }
};

/* ======================================================
    REGISTER: Test Support Mailbox
   ====================================================== */

const registerTestSupportMailboxSchema = z.object({
  email_address: z.string().email(),
  password: z.string().min(1),
  imap: z.string().min(1),
  imap_port: z.number().int().min(1),
  smtp: z.string().min(1),
  smtp_port: z.number().int().min(1),
});

const registerTestSupportMailbox = async (
  input: z.infer<typeof registerTestSupportMailboxSchema>,
  context: ActionAPIContext
) => {
  logger.debug("actions.registerTestSupportMailbox", `Testing mailbox connection for: ${input.email_address}`);
  
  try {
    // Get authenticated user session
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    const { data: { session } } = await ssr.auth.getSession();
    
    if (!session?.access_token) {
      return { success: false, message: "Unauthorized" };
    }
    
    // Call backend API to test connections
    const apiUrl = import.meta.env.PUBLIC_API_URL || 'http://localhost:3000/api';
    const response = await fetch(`${apiUrl}/emails/test-mailbox`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        email_address: input.email_address,
        password: input.password,
        imap: input.imap,
        imap_port: input.imap_port,
        smtp: input.smtp,
        smtp_port: input.smtp_port,
      }),
    });
    
    const result = await response.json();
    
    if (!response.ok || !result.success) {
      logger.error("actions.registerTestSupportMailbox", "Backend test failed:", result);
      return {
        success: false,
        message: result.message || 'Connection test failed',
        details: result.details,
        errors: result.errors,
      };
    }
    
    logger.debug("actions.registerTestSupportMailbox", "Backend test successful");
    return {
      success: true,
      message: result.message,
      details: result.details,
    };
  } catch (e: any) {
    logger.error("actions.registerTestSupportMailbox", "Unexpected error:", e);
    return { 
      success: false, 
      message: "Connection test failed: " + (e?.message || "Unknown error") 
    };
  }
};


/* ----------------------- EXPORTS ----------------------- */

/* ----------------------- UNASSIGN ALL TICKETS FROM EMPLOYEE ----------------------- */

// Schema for unassigning all tickets
const unassignAllTicketsSchema = z.object({
  employeeId: z.number(),
});

type UnassignAllTicketsInput = z.infer<typeof unassignAllTicketsSchema>;

/**
 * Admin-only: Unassign all customers/tickets from an employee
 * Sets employee_id to NULL for all customers assigned to this employee
 */
const unassignAllTickets = async (
  { employeeId }: UnassignAllTicketsInput,
  context: ActionAPIContext
) => {
  logger.debug("actions.unassignAllTickets", `start, employeeId: ${employeeId}`);
  try {
    // 1) Verify the current user is authenticated
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    const { data: { user }, error: userErr } = await ssr.auth.getUser();
    if (userErr || !user) {
      logger.error("actions.unassignAllTickets", "getUser error:", userErr?.message);
      return { success: false, message: "Unauthorized" };
    }

    // 2) Verify the user is an admin
    const { data: me, error: meErr } = await ssr
      .from("employees")
      .select("id, client_id")
      .eq("user_id", user.id)
      .single();

    if (meErr || !me) {
      logger.error("actions.unassignAllTickets", "employee lookup:", meErr?.message);
      return { success: false, message: "Employee not found" };
    }

    const { data: roles } = await ssr
      .from("roles-employees")
      .select("role_id")
      .eq("employee_id", me.id);

    const amIAdmin = roles?.some((r) => r.role_id === 1);
    if (!amIAdmin) {
      logger.error("actions.unassignAllTickets", "User is not admin");
      return { success: false, message: "Forbidden" };
    }

    // 3) Verify target employee belongs to same client
    const admin = createAdmin(
      import.meta.env.SUPABASE_URL!,
      import.meta.env.SUPABASE_KEY!,
      { auth: { persistSession: false } }
    );

    const { data: targetEmployee, error: targetErr } = await admin
      .from("employees")
      .select("id, client_id, name")
      .eq("id", employeeId)
      .single();

    if (targetErr || !targetEmployee) {
      logger.error("actions.unassignAllTickets", "target lookup:", targetErr?.message);
      return { success: false, message: "Target employee not found" };
    }

    if (targetEmployee.client_id !== me.client_id) {
      logger.error("actions.unassignAllTickets", "Client mismatch");
      return { success: false, message: "Cannot modify employees from other clients" };
    }

    // 4) Count affected customers first
    const { count: affectedCount } = await admin
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("employee_id", employeeId)
      .eq("client_id", me.client_id);

    // 5) Unassign all customers from this employee
    const { error: updateErr } = await admin
      .from("customers")
      .update({ employee_id: null })
      .eq("employee_id", employeeId)
      .eq("client_id", me.client_id);

    if (updateErr) {
      logger.error("actions.unassignAllTickets", "update error:", updateErr.message);
      return { success: false, message: "Failed to unassign tickets" };
    }

    logger.info("actions.unassignAllTickets", `Unassigned ${affectedCount} customers from employee ${employeeId}`);

    // Log activity
    try {
      const { data: { session: logSession } } = await ssr.auth.getSession();
      if (logSession?.access_token) {
        logActivityFromAction(logSession.access_token, {
          action: 'assignment.bulk_unassigned',
          category: 'assignment',
          targetType: 'employee',
          targetId: String(employeeId),
          details: { employeeName: targetEmployee.name, ticketCount: affectedCount || 0 },
        });
      }
    } catch {}

    return { 
      success: true, 
      message: `Successfully unassigned ${affectedCount || 0} ticket(s) from ${targetEmployee.name}`,
      count: affectedCount || 0
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("actions.unassignAllTickets", "unexpected:", message);
    return { success: false, message: "Unexpected error" };
  }
};

/* ----------------------- REASSIGN ALL TICKETS TO ANOTHER EMPLOYEE ----------------------- */

// Schema for reassigning all tickets
const reassignAllTicketsSchema = z.object({
  fromEmployeeId: z.number(),
  toEmployeeId: z.number(),
});

type ReassignAllTicketsInput = z.infer<typeof reassignAllTicketsSchema>;

/**
 * Admin-only: Reassign all customers/tickets from one employee to another
 */
const reassignAllTickets = async (
  { fromEmployeeId, toEmployeeId }: ReassignAllTicketsInput,
  context: ActionAPIContext
) => {
  logger.debug("actions.reassignAllTickets", `start, from: ${fromEmployeeId}, to: ${toEmployeeId}`);
  try {
    // 1) Verify the current user is authenticated
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    const { data: { user }, error: userErr } = await ssr.auth.getUser();
    if (userErr || !user) {
      logger.error("actions.reassignAllTickets", "getUser error:", userErr?.message);
      return { success: false, message: "Unauthorized" };
    }

    // 2) Verify the user is an admin
    const { data: me, error: meErr } = await ssr
      .from("employees")
      .select("id, client_id")
      .eq("user_id", user.id)
      .single();

    if (meErr || !me) {
      logger.error("actions.reassignAllTickets", "employee lookup:", meErr?.message);
      return { success: false, message: "Employee not found" };
    }

    const { data: roles } = await ssr
      .from("roles-employees")
      .select("role_id")
      .eq("employee_id", me.id);

    const amIAdmin = roles?.some((r) => r.role_id === 1);
    if (!amIAdmin) {
      logger.error("actions.reassignAllTickets", "User is not admin");
      return { success: false, message: "Forbidden" };
    }

    // 3) Use admin client
    const admin = createAdmin(
      import.meta.env.SUPABASE_URL!,
      import.meta.env.SUPABASE_KEY!,
      { auth: { persistSession: false } }
    );

    // 4) Verify both employees belong to same client
    const { data: fromEmployee, error: fromErr } = await admin
      .from("employees")
      .select("id, client_id, name")
      .eq("id", fromEmployeeId)
      .single();

    if (fromErr || !fromEmployee || fromEmployee.client_id !== me.client_id) {
      logger.error("actions.reassignAllTickets", "from employee invalid");
      return { success: false, message: "Source employee not found or access denied" };
    }

    const { data: toEmployee, error: toErr } = await admin
      .from("employees")
      .select("id, client_id, name")
      .eq("id", toEmployeeId)
      .single();

    if (toErr || !toEmployee || toEmployee.client_id !== me.client_id) {
      logger.error("actions.reassignAllTickets", "to employee invalid");
      return { success: false, message: "Target employee not found or access denied" };
    }

    // 5) Count affected customers first
    const { count: affectedCount } = await admin
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("employee_id", fromEmployeeId)
      .eq("client_id", me.client_id);

    // 6) Reassign all customers
    const { error: updateErr } = await admin
      .from("customers")
      .update({ employee_id: toEmployeeId })
      .eq("employee_id", fromEmployeeId)
      .eq("client_id", me.client_id);

    if (updateErr) {
      logger.error("actions.reassignAllTickets", "update error:", updateErr.message);
      return { success: false, message: "Failed to reassign tickets" };
    }

    logger.info("actions.reassignAllTickets", `Reassigned ${affectedCount} customers from ${fromEmployeeId} to ${toEmployeeId}`);

    // Log activity
    try {
      const { data: { session: logSession } } = await ssr.auth.getSession();
      if (logSession?.access_token) {
        logActivityFromAction(logSession.access_token, {
          action: 'assignment.bulk_reassigned',
          category: 'assignment',
          targetType: 'employee',
          targetId: String(toEmployeeId),
          details: { fromEmployeeId, fromName: fromEmployee.name, toName: toEmployee.name, ticketCount: affectedCount || 0 },
        });
      }
    } catch {}

    return { 
      success: true, 
      message: `Successfully reassigned ${affectedCount || 0} ticket(s) from ${fromEmployee.name} to ${toEmployee.name}`,
      count: affectedCount || 0
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("actions.reassignAllTickets", "unexpected:", message);
    return { success: false, message: "Unexpected error" };
  }
};

/* ----------------------- GET EMPLOYEES FOR REASSIGNMENT ----------------------- */

/**
 * Get list of employees for reassignment dropdown
 */
const getEmployeesForReassignment = async (
  _input: {},
  context: ActionAPIContext
) => {
  logger.debug("actions.getEmployeesForReassignment", "start");
  try {
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    const { data: { user }, error: userErr } = await ssr.auth.getUser();
    if (userErr || !user) {
      return { success: false, message: "Unauthorized", employees: [] };
    }

    const { data: me } = await ssr
      .from("employees")
      .select("id, client_id")
      .eq("user_id", user.id)
      .single();

    if (!me) {
      return { success: false, message: "Employee not found", employees: [] };
    }

    const { data: employees } = await ssr
      .from("employees")
      .select("id, name")
      .eq("client_id", me.client_id)
      .or("disabled.is.null,disabled.eq.false")
      .order("name");

    return { 
      success: true, 
      employees: employees || [] 
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("actions.getEmployeesForReassignment", "error:", message);
    return { success: false, message: "Unexpected error", employees: [] };
  }
};

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
      logger.debug("actions.signOut", "start");
      const supabase = createSSR({ request: context.request, cookies: context.cookies });
      logger.debug("actions.signOut", "SSR client created");
      
      // Save session for activity logging before sign-out destroys it
      const { data: { session: preSignOutSession } } = await supabase.auth.getSession();
      
      const { error } = await supabase.auth.signOut();
      if (error) {
        logger.error("actions.signOut", "error:", error);
        return { success: false, message: error.message };
      }

      // Log activity (using saved token since session is now destroyed)
      if (preSignOutSession?.access_token) {
        logActivityFromAction(preSignOutSession.access_token, {
          action: 'auth.signed_out',
          category: 'auth',
        });
      }

      logger.info("actions.signOut", "ok");
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

  // Admin-only employee disable
  disableEmployee: defineAction({
    accept: "form",
    input: disableEmployeeSchema,
    handler: (input, context) => disableEmployee(input, context),
  }),

  // Admin-only employee enable
  enableEmployee: defineAction({
    accept: "form",
    input: enableEmployeeSchema,
    handler: (input, context) => enableEmployee(input, context),
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

  // Self-service profile update (name and avatar)
  updateMyProfile: defineAction({
    accept: "json",
    input: updateMyProfileSchema,
    handler: (input, context) => updateMyProfile(input, context),
  }),

  // Self-service password reset email (for authenticated users)
  sendPasswordResetEmail: defineAction({
    accept: "json",
    input: z.object({}),
    handler: (input, context) => sendPasswordResetEmail(input, context),
  }),

  // Admin-only: Unassign all tickets from an employee
  unassignAllTickets: defineAction({
    accept: "json",
    input: unassignAllTicketsSchema,
    handler: (input, context) => unassignAllTickets(input, context),
  }),

  // Admin-only: Reassign all tickets from one employee to another
  reassignAllTickets: defineAction({
    accept: "json",
    input: reassignAllTicketsSchema,
    handler: (input, context) => reassignAllTickets(input, context),
  }),

  // Get employees list for reassignment dropdown
  getEmployeesForReassignment: defineAction({
    accept: "json",
    input: z.object({}),
    handler: (input, context) => getEmployeesForReassignment(input, context),
  }),

};