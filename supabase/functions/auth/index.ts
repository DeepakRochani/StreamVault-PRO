// ============================================================
// SUPABASE EDGE FUNCTION: auth
// Route: /functions/v1/auth/*
// Real Session & Identity Manager for StreamVault PRO
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, cookie",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
};

const ADMIN_EMAIL = "admin@streamvault.com";
const ADMIN_PASS = "streamvault2026";

const mockAdminUser = {
  id: "admin_master_1",
  email: ADMIN_EMAIL,
  name: "Master Administrator",
  role: "super_admin",
  password_reset_required: 0,
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathname = url.pathname.replace(/^\/functions\/v1/, "").replace(/^\/auth/, "");

  const authHeader = req.headers.get("Authorization");
  const cookie = req.headers.get("cookie") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://sjnamkshicpxtyikzsnp.supabase.co";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqbmFta3NoaWNweHR5aWt6c25wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MzEzOTYsImV4cCI6MjEwMTMwNzM5Nn0.pZG7nQhnuzxc19umXyztJ-CLhFYe5p527IGxlI_9hNc";

  // ── 1. Session check: /me or root ─────────────────────────────
  if (pathname === "/me" || pathname === "" || pathname === "/") {
    // 1a. Check if Admin Session Token or Cookie is present
    const isTokenAdmin = authHeader && (authHeader.includes("sv_admin_jwt_") || authHeader.includes("sv_admin_token"));
    if (cookie.includes("token=sv_admin_token") || isTokenAdmin) {
      return new Response(JSON.stringify({
        success: true,
        loggedIn: true,
        user: mockAdminUser,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1b. Check if Authorization Bearer User JWT is provided
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "").trim();
      // Ensure it's not just the static anon key
      if (token && token !== supabaseAnonKey) {
        try {
          const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false },
            global: { headers: { Authorization: authHeader } },
          });
          const { data: { user }, error } = await supabase.auth.getUser(token);
          if (user && !error) {
            const isAdmin = user.email === ADMIN_EMAIL;
            return new Response(JSON.stringify({
              success: true,
              loggedIn: true,
              user: {
                id: user.id,
                email: user.email,
                name: user.user_metadata?.full_name || user.user_metadata?.name || (user.email ? user.email.split("@")[0] : "User"),
                role: isAdmin ? "super_admin" : (user.user_metadata?.role || "user"),
                created_at: user.created_at,
              },
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch (jwtErr) {
          console.warn("JWT validation error:", jwtErr);
        }
      }
    }

    // 1c. Unauthenticated guest: return loggedIn: false
    return new Response(JSON.stringify({
      success: true,
      loggedIn: false,
      user: null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── 2. Login endpoint (/login) ────────────────────────────────
  if (pathname === "/login") {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { email, password } = body;

      // Admin Login
      if (email === ADMIN_EMAIL && password === ADMIN_PASS) {
        return new Response(JSON.stringify({
          success: true,
          loggedIn: true,
          user: mockAdminUser,
          token: "sv_admin_token",
        }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Set-Cookie": "token=sv_admin_token; Path=/; SameSite=Lax; Max-Age=86400",
          },
        });
      }

      // User Login via Supabase Auth
      try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false },
        });
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          return new Response(JSON.stringify({
            success: false,
            error: error.message,
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({
          success: true,
          loggedIn: true,
          user: {
            id: data.user.id,
            email: data.user.email,
            name: data.user.user_metadata?.full_name || (data.user.email ? data.user.email.split("@")[0] : "User"),
            role: "user",
          },
          session: data.session,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ success: false, error: message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  }

  // ── 3. Register endpoint (/register) ─────────────────────────
  if (pathname === "/register") {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { email, password, name } = body;

      try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false },
        });
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name || (email ? email.split("@")[0] : "User"),
              name: name || (email ? email.split("@")[0] : "User"),
            },
          },
        });

        if (error) {
          return new Response(JSON.stringify({
            success: false,
            error: error.message,
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({
          success: true,
          loggedIn: !!data.session,
          user: data.user ? {
            id: data.user.id,
            email: data.user.email,
            name: data.user.user_metadata?.full_name || name || "User",
            role: "user",
          } : null,
          session: data.session,
          message: data.session
            ? "Account created successfully"
            : "Account created! Please check your email to confirm your account.",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ success: false, error: message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  }

  // ── 4. Logout endpoint (/logout) ──────────────────────────────
  if (pathname === "/logout") {
    return new Response(JSON.stringify({ success: true, loggedIn: false }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Set-Cookie": "token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
      },
    });
  }

  // ── 5. Supabase Sync (/supabase-sync) ─────────────────────────
  if (pathname === "/supabase-sync") {
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: false, error: "Not found: " + pathname }), {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
