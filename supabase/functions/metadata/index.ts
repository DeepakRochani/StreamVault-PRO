// ============================================================
// SUPABASE EDGE FUNCTION: metadata
// Route: POST /functions/v1/metadata
//
// Gets YouTube/social video info using:
//  - YouTube oEmbed API (no key needed) for title
//  - Direct YouTube thumbnail URLs
//  - YouTube Data API v3 if YOUTUBE_API_KEY env var is set (for duration)
//  - cobalt.tools API availability check
//
// Returns the same response shape as the old /api/metadata route
// so the frontend needs zero changes to the data-rendering code.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── helpers ──────────────────────────────────────────────────

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function parseIsoDuration(iso: string): string {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "--:--";
  const h = parseInt(m[1] ?? "0");
  const min = parseInt(m[2] ?? "0");
  const s = parseInt(m[3] ?? "0");
  if (h > 0) return `${h}:${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${min}:${String(s).padStart(2, "0")}`;
}

// ── main handler ─────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url, type } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── YouTube ───────────────────────────────────────────────
    const videoId = extractVideoId(url);
    if (!videoId) {
      return new Response(
        JSON.stringify({ error: "Could not extract a YouTube video ID from the provided URL." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let title = "Unknown Title";
    let channelName = "";
    let duration = "--:--";

    // Best-quality thumbnail directly from YouTube CDN (no API key)
    let thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    // 1. YouTube oEmbed — free, no key, gives title + author
    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
        { headers: { "User-Agent": "StreamVault/1.0" } }
      );
      if (oembedRes.ok) {
        const d = await oembedRes.json();
        title = d.title ?? title;
        channelName = d.author_name ?? "";
      }
    } catch (_) { /* non-fatal */ }

    // 2. YouTube Data API v3 — gives duration + better thumbnails (optional)
    const YT_KEY = Deno.env.get("YOUTUBE_API_KEY");
    if (YT_KEY) {
      try {
        const ytRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${YT_KEY}&part=snippet,contentDetails`
        );
        if (ytRes.ok) {
          const ytData = await ytRes.json();
          const item = ytData.items?.[0];
          if (item) {
            title = item.snippet?.title ?? title;
            channelName = item.snippet?.channelTitle ?? channelName;
            const thumbs = item.snippet?.thumbnails;
            thumbnail =
              thumbs?.maxres?.url ??
              thumbs?.high?.url ??
              thumbs?.medium?.url ??
              thumbnail;
            duration = parseIsoDuration(item.contentDetails?.duration ?? "");
          }
        }
      } catch (_) { /* non-fatal */ }
    }

    // 3. Build standard format list
    //    cobalt.tools supports these qualities — we list them all;
    //    if a quality isn't available, cobalt will return the best it has.
    const videoFormats = [
      { quality: "4K (2160p)", id: "2160p", sizeStr: "~1.5 GB",  recommended: false },
      { quality: "1440p",      id: "1440p", sizeStr: "~700 MB",  recommended: false },
      { quality: "1080p HD",   id: "1080p", sizeStr: "~350 MB",  recommended: true  },
      { quality: "720p HD",    id: "720p",  sizeStr: "~180 MB",  recommended: false },
      { quality: "480p",       id: "480p",  sizeStr: "~80 MB",   recommended: false },
      { quality: "360p",       id: "360p",  sizeStr: "~50 MB",   recommended: false },
    ];

    const audioFormats = [
      { quality: "MP3 Best Quality", id: "128K", sizeStr: "~8 MB/min", recommended: true },
    ];

    const payload = {
      title,
      thumbnail,
      duration,
      platform: "youtube",
      channel: channelName,
      videoId,
      url,
      videoFormats,
      audioFormats,
    };

    return new Response(JSON.stringify(payload), {
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
