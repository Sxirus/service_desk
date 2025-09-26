import { defineAction, type ActionAPIContext } from "astro:actions";
import { z } from "astro:schema";
import { createClient as createSSR } from "../lib/supabase.ts";
import { createClient as createAdmin } from "@supabase/supabase-js";

/* ----------------------- SIGN IN (Password) ----------------------- */

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
    const supabase = createSSR({
      request: context.request,
      cookies: context.cookies,
    });

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    });

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
    const supabase = createSSR({
      request: context.request,
      cookies: context.cookies,
    });

    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      captchaToken,
      redirectTo: "http://localhost:4321/update-password",
    });

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

const createEmployeeSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  // deine Rollen: 1 = admin, 2 = User
  role_id: z.coerce.number().int().refine((v) => v === 1 || v === 2, {
    message: "invalid role_id",
  }),
});

type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

const createEmployee = async (
  { email, name, role_id }: CreateEmployeeInput,
  context: ActionAPIContext
) => {
  console.log("[actions.createEmployee] start");
  try {
    // 1) eingeloggten User verifizieren
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    const { data: { user }, error: userErr } = await ssr.auth.getUser();
    if (userErr || !user) {
      console.error("[actions.createEmployee] getUser error:", userErr?.message);
      return { success: false, message: "Unauthorized" };
    }
    console.log("[actions.createEmployee] Debug after 1")
    // 2) meinen Employee + Mandant
    const { data: me, error: meErr } = await ssr
      .from("employees")
      .select("id, client_id")
      .eq("user_id", user.id)
      .single();

    if (meErr || !me) {
      console.error("[actions.createEmployee] employees lookup:", meErr?.message);
      return { success: false, message: "Forbidden" };
    }
    console.log("[actions.createEmployee] Debug after 2")

    // 3) Admin-Check (rolle 1 = admin)
    const { data: myRoles, error: rolesErr } = await ssr
      .from("roles-employees")
      .select("role_id")
      .eq("employee_id", me.id);

    if (rolesErr) {
      console.error("[actions.createEmployee] roles lookup:", rolesErr.message);
      return { success: false, message: "Forbidden" };
    }

    const amIAdmin = !!myRoles?.some((r) => r.role_id === 1);
    if (!amIAdmin) return { success: false, message: "Forbidden" };

    console.log("[actions.createEmployee] Debug after 3")

    // 4) Service-Role Client (NUR serverseitig!)
    const admin = createAdmin(
      import.meta.env.SUPABASE_URL!,
      import.meta.env.SUPABASE_KEY!,
      { auth: { persistSession: false } }
    );

    console.log("[actions.createEmployee] Debug after 4");

    // 5) auth.users anlegen
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: { name },
    });
    if (createErr) {
      console.error("[actions.createEmployee] createUser:", createErr.message);
      return { success: false, message: createErr.message };
    }

    console.log("[actions.createEmployee] Debug after 5");

    // 6) employees-Zeile im selben Mandanten
    const { data: empRow, error: empErr } = await admin
      .from("employees")
      .insert({ user_id: created.user.id, client_id: me.client_id, name })
      .select("id")
      .single();
    if (empErr) {
      console.error("[actions.createEmployee] insert employees:", empErr.message);
      return { success: false, message: empErr.message };
    }

    console.log("[actions.createEmployee] Debug after 6");

    // 7) Rolle setzen
    const { error: relErr } = await admin
      .from("roles-employees")
      .insert({ role_id, employee_id: empRow.id });
    if (relErr) {
      console.error("[actions.createEmployee] insert roles-employees:", relErr.message);
      return { success: false, message: relErr.message };
    }

    console.log("[actions.createEmployee] Debug after 7");

    // 8) Reset-Mail mit Redirect auf deine Update-Seite
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
  signIn: defineAction({
    accept: "form",
    input: z.object({
      email: z.string().email(),
      password: z.string().min(6),
      captchaToken: z.string(),
    }),
    handler: (input, context) => emailSignIn(input, context),
  }),

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

  resetPassword: defineAction({
    accept: "form",
    input: z.object({
      email: z.string().email(),
      captchaToken: z.string(),
    }),
    handler: (input, context) => passwordReset(input, context),
  }),

  createEmployee: defineAction({
    accept: "form",
    input: createEmployeeSchema,
    handler: (input, context) => createEmployee(input, context),
  }),
};
