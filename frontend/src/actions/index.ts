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
};
