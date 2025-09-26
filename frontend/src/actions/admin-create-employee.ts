// src/pages/actions/admin-create-employee.ts
import { defineAction, type ActionAPIContext } from "astro:actions";
import { z } from "astro:schema";
import { createClient as createSSR } from "../lib/supabase.ts";
import { createClient as createAdmin } from "@supabase/supabase-js";

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  // Deine Rollen: 1 = admin, 2 = User
  role_id: z.coerce.number().int().refine((v) => v === 1 || v === 2, {
    message: "invalid role_id",
  }),
});

type Input = z.infer<typeof schema>;
type Result =
  | { success: true; message: string }
  | { success: false; message: string };

async function createEmployee(
  { email, name, role_id }: Input,
  context: ActionAPIContext
): Promise<Result> {
  try {
    // 1) eingeloggten User verifizieren
    const ssr = createSSR({ request: context.request, cookies: context.cookies });
    const { data: { user }, error: userErr } = await ssr.auth.getUser();
    if (userErr) {
      console.error("[admin-create] getUser error:", userErr.message);
      return { success: false, message: "Unauthorized" };
    }
    if (!user) return { success: false, message: "Unauthorized" };

    // 2) meine Employee-Zeile + Mandant ermitteln
    const { data: me, error: meErr } = await ssr
      .from("employees")
      .select("id, client_id")
      .eq("user_id", user.id)
      .single();

    if (meErr || !me) {
      console.error("[admin-create] employees lookup error:", meErr?.message);
      return { success: false, message: "Forbidden" };
    }

    // 3) Admin-Check (rolle 1 = admin)
    const { data: myRoles, error: rolesErr } = await ssr
      .from("roles-employees")
      .select("role_id")
      .eq("employee_id", me.id);

    if (rolesErr) {
      console.error("[admin-create] roles lookup error:", rolesErr.message);
      return { success: false, message: "Forbidden" };
    }

    const amIAdmin = !!myRoles?.some((r: any) => r.role_id === 1);
    if (!amIAdmin) return { success: false, message: "Forbidden" };

    // 4) Service-Role Client (nur serverseitig!)
    const admin = createAdmin(
      import.meta.env.SUPABASE_URL!,
      import.meta.env.SUPABASE_KEY!,
      { auth: { persistSession: false } }
    );

    // 5) auth.users anlegen
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: { name },
    });
    if (createErr) {
      console.error("[admin-create] createUser error:", createErr.message);
      return { success: false, message: createErr.message };
    }

    // 6) employees-Zeile im selben Mandanten
    const { data: empRow, error: empErr } = await admin
      .from("employees")
      .insert({
        user_id: created.user.id,
        client_id: me.client_id,
        name,
      })
      .select("id")
      .single();
    if (empErr) {
      console.error("[admin-create] insert employee error:", empErr.message);
      return { success: false, message: empErr.message };
    }

    // 7) Rolle setzen
    const { error: relErr } = await admin
      .from("roles-employees")
      .insert({ role_id, employee_id: empRow.id });
    if (relErr) {
      console.error("[admin-create] insert roles-employees error:", relErr.message);
      return { success: false, message: relErr.message };
    }

    // 8) Reset-Mail mit Redirect auf deine Update-Seite
    await admin.auth.resetPasswordForEmail(email, {
      redirectTo: new URL("/update-password", context.request.url).toString(),
    });

    return { success: true, message: "Employee created and invite sent" };
  } catch (e: any) {
    console.error("[admin-create] unexpected error:", e?.message ?? e);
    return { success: false, message: "Unexpected error" };
  }
}

export const server = {
  createEmployee: defineAction({
    accept: "form",
    input: schema,
    handler: async (input, context) => {
      return createEmployee(input, context);
    },
  }),
};
