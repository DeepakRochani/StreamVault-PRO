// ============================================================
// SUPABASE EDGE FUNCTION: download
// Route: POST /functions/v1/download
//
// Calls the cobalt.tools open-source API to get a direct
// download URL for a YouTube video or audio track.
//
// cobalt.tools is free, open-source, and requires no API key.
// Docs: https://github.com/imputnet/cobalt
//
// Request body:
//   { url: string, quality: string, format: "mp4"|"mp3" }
//
// Response:
//   { success: true, downloadUrl: string, filename: string }
//   { error: string }
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Map StreamVault quality IDs → cobalt.tools videoQuality strings
const VIDEO_QUALITY_MAP: Record<string, string> = {
  "2160p": "2160",
  "1440p": "1440",
  "1080p": "1080",
  "720p":  "720",
  "480p":  "480",
  "360p":  "360",
  "240p":  "240",
  "144p":  "144",
  // Audio
  "320K":  "128",  // cobalt returns best available audio
  "128K":  "128",
  "64K":   "64",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url, quality, format } = await req.json();

    if (!url) {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isAudio   = format === "mp3";
    const vidQuality = VIDEO_QUALITY_MAP[quality] ?? "1080";

    // ── Call cobalt.tools ─────────────────────────────────────
    // Using the official public instance. Self-host for production
    // to avoid rate limits: https://github.com/imputnet/cobalt
    const COBALT_API = Deno.env.get("COBALT_API_URL") ?? "https://api.cobalt.tools/";

    const cobaltRes = await fetch(COBALT_API, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Accept":        "application/json",
        "User-Agent":    "StreamVault/1.0",
      },
      body: JSON.stringify({
        url,
        videoQuality:     vidQuality,
        downloadMode:     isAudio ? "audio" : "auto",
        audioFormat:      isAudio ? "mp3"   : "best",
        filenamePattern:  "basic",
        isNoTTWatermark:  true,
      }),
    });

    const cobaltData = await cobaltRes.json();

    // ── Handle cobalt response statuses ──────────────────────
    // "redirect"  → direct CDN URL (no tunnel needed)
    // "tunnel"    → cobalt proxy stream URL
    // "picker"    → multi-item (e.g. playlist) — return first item
    // "error"     → something went wrong

    if (cobaltData.status === "redirect" || cobaltData.status === "tunnel") {
      return new Response(
        JSON.stringify({
          success:     true,
          downloadUrl: cobaltData.url,
          filename:    cobaltData.filename ?? `download.${isAudio ? "mp3" : "mp4"}`,
          via:         cobaltData.status,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (cobaltData.status === "picker" && cobaltData.picker?.length > 0) {
      const item = cobaltData.picker[0];
      return new Response(
        JSON.stringify({
          success:     true,
          downloadUrl: item.url,
          filename:    cobaltData.filename ?? `download.${isAudio ? "mp3" : "mp4"}`,
          via:         "picker",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // cobalt returned an error
    const errMsg =
      cobaltData.error?.code ??
      cobaltData.text ??
      cobaltData.error ??
      "cobalt.tools returned an unexpected response";

    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
