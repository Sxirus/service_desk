// src/pages/actions/admin-create-employee.ts
import { defineAction, type ActionAPIContext } from "astro:actions";
import { z } from "astro:schema";
import { createClient as createSSR } from "../lib/supabase.ts";
import { createClient as createAdmin } from "@supabase/supabase-js";

// Schema for validating employee creation input
const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  // Role validation: 1 = admin, 2 = regular user
  role_id: z.coerce.number().int().refine((v) => v === 1 || v === 2, {
    message: "invalid role_id",
  }),
});

// Type definitions for better type safety
type Input = z.infer<typeof schema>;
type Result =
  | { success: true; message: string }
  | { success: false; message: string };

/**
 * Creates a new employee account with proper role assignment
 * Only accessible to admin users within the same client/organization
 *
 * @param email - Email address for the new employee
 * @param name - Display name for the new employee
 * @param role_id - Role assignment (1 = admin, 2 = user)
 * @param context - Astro action context containing request and cookies
 * @returns Promise with success/error result
 */
async function createEmployee(
  { email, name, role_id }: Input,
  context: ActionAPIContext
): Promise<Result> {
  try {
    // 1) Verify the current user is authenticated
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    const { data: { user }, error: userErr } = await ssr.auth.getUser();
    if (userErr) {
      console.error("[admin-create] getUser error:", userErr.message);
      return { success: false, message: "Unauthorized" };
    }
    if (!user) return { success: false, message: "Unauthorized" };

    // 2) Get current employee record and client ID to ensure same organization
    const { data: me, error: meErr } = await ssr
      .from("employees")
      .select("id, client_id")
      .eq("user_id", user.id)
      .single();

    if (meErr || !me) {
      console.error("[admin-create] employees lookup error:", meErr?.message);
      return { success: false, message: "Forbidden" };
    }

    // 3) Check if current user has admin privileges (role_id = 1)
    const { data: myRoles, error: rolesErr } = await ssr
      .from("roles-employees")
      .select("role_id")
      .eq("employee_id", me.id);

    if (rolesErr) {
      console.error("[admin-create] roles lookup error:", rolesErr.message);
      return { success: false, message: "Forbidden" };
    }

    // Verify admin permissions
    const amIAdmin = !!myRoles?.some((r: any) => r.role_id === 1);
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
      console.error("[admin-create] createUser error:", createErr.message);
      return { success: false, message: createErr.message };
    }

    // 6) Create employee record in the same client/organization
    const { data: empRow, error: empErr } = await admin
      .from("employees")
      .insert({
        user_id: created.user.id,
        client_id: me.client_id, // Same organization as the creating admin
        name,
      })
      .select("id")
      .single();
    if (empErr) {
      console.error("[admin-create] insert employee error:", empErr.message);
      return { success: false, message: empErr.message };
    }

    // 7) Assign role to the new employee
    const { error: relErr } = await admin
      .from("roles-employees")
      .insert({ role_id, employee_id: empRow.id });
    if (relErr) {
      console.error("[admin-create] insert roles-employees error:", relErr.message);
      return { success: false, message: relErr.message };
    }

    // 8) Send password reset email as account activation method
    await admin.auth.resetPasswordForEmail(email, {
      redirectTo: new URL("/update-password", context.request.url).toString(),
    });

    return { success: true, message: "Employee created and invite sent" };
  } catch (e: any) {
    console.error("[admin-create] unexpected error:", e?.message ?? e);
    return { success: false, message: "Unexpected error" };
  }
}

// Export the action for use in Astro pages
export const server = {
  // Admin-only action to create new employees with role assignment
  createEmployee: defineAction({
    accept: "form", // Accept form data input
    input: schema, // Validate input using Zod schema
    handler: async (input, context) => {
      return createEmployee(input, context);
    },
  }),
};
