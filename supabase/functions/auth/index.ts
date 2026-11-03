// ============================================================
// SUPABASE EDGE FUNCTION: auth
// Route: /functions/v1/auth/*
// Handles auth session checks and user identity for StreamVault PRO
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, cookie",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
};

const mockAdminUser = {
  id: "admin_master_1",
  email: "admin@streamvault.com",
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

  if (pathname === "/me" || pathname === "") {
    return new Response(JSON.stringify({
      success: true,
      user: mockAdminUser,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (pathname === "/logout") {
    return new Response(JSON.stringify({ success: true }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Set-Cookie": "token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      },
    });
  }

  return new Response(JSON.stringify({ success: true, user: mockAdminUser }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
