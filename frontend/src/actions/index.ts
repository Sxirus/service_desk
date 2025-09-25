import { defineAction, type ActionAPIContext } from "astro:actions";
import { z } from "astro:schema";
import { createClient } from "../lib/supabase.ts";

const emailSignUp = async (
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
    console.log("Sign up action");
    try {
        const supabase = createClient({
            request: context.request,
            cookies: context.cookies,
        });

        /*const { data, error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                captchaToken,
                emailRedirectTo: "http://localhost:4321/api/exchange",
            },
        });*/

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
            options: {
                captchaToken,
            },
        });

        if (error) {
            console.error("Sign up error", error);
            return {
                success: false,
                message: error.message,
            };
        } else {
            console.log("Sign up success", data);
            return {
                success: true,
                message: "Successfully logged in",
            };
        }
    } catch (err) {
        console.error("SignUp action other error", err);
        return {
            success: false,
            message: "Unexpected error",
        };
    }
};

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
    console.log("Password reset action");
    try {
        const supabase = createClient({
            request: context.request,
            cookies: context.cookies,
        });

        const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
            captchaToken,
            redirectTo: 'http://localhost:4321/update-password',
        });

        if (error) {
            console.error("Password reset error", error);
            return {
                success: false,
                message: error.message,
            };
        } else {
            console.log("Password reset success", data);
            return {
                success: true,
                message: "Password reset email sent",
            };
        }
    } catch (err) {
        console.error("PasswordReset action other error", err);
        return {
            success: false,
            message: "Unexpected error",
        };
    }
};

export const server = {
    signIn: defineAction({
        accept: "form",
        input: z.object({
            email: z.string().email(),
            password: z.string().min(6),
            captchaToken: z.string(),
        }),
        handler: async (input, context) => {
            return emailSignUp(input, context);
        },
    }),
    signOut: defineAction({
        handler: async (_, context) => {
            const supabase = createClient({
                request: context.request,
                cookies: context.cookies,
            });
            const { error } = await supabase.auth.signOut();
            if (error) {
                console.error("Sign out error", error);
                return {
                    success: false,
                    message: error.message,
                };
            }
            return {
                success: true,
                message: "Successfully signed out",
            };
        },
    }),
    resetPassword: defineAction({
        accept: "form",
        input: z.object({
            email: z.string().email(),
            captchaToken: z.string(),
        }),
        handler: async (input, context) => {
            return passwordReset(input, context);
        },
    }),
};