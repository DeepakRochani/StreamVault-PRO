// ============================================================
// SUPABASE EDGE FUNCTION: download
// Route: /functions/v1/download
// High-res (1080p/4K/MP3) cloud downloader & stream proxy with
// YouTube BotGuard bypass, mobile Innertube emulation, and
// multi-instance cloud muxing failover.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Innertube, Platform, UniversalCache } from "npm:youtubei.js@latest";

// ── Configure JavaScript interpreter shim for YouTube decipher algorithms ──
if (Platform && Platform.shim) {
  Platform.load({
    ...Platform.shim,
    eval: async (data: any, env: any = {}) => {
      try {
        const code = typeof data === "string" ? data : (data?.output || data?.code || String(data));
        const fn = new Function("env", code + '; return typeof result !== "undefined" ? result : (typeof module !== "undefined" && module.exports ? module.exports : globalThis.result);');
        return fn(env);
      } catch (evalErr) {
        console.error("[Download Shim Eval Error]:", evalErr);
        throw evalErr;
      }
    },
  });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const defaultCookie = "GPS=1; PREF=hl=en&tz=UTC; SOCS=CAI; VISITOR_INFO1_LIVE=zjW6Y_RzRUI; VISITOR_PRIVACY_METADATA=CgJJThIEGgAgGg%3D%3D; YSC=JNKtOAO-9B4; __Secure-ROLLOUT_TOKEN=CMS3w9CquMO7HBDkkLrOjZiVAxjy_IHdjZiVAw%3D%3D";

// Redundant Cobalt API endpoints for 1080p/4K DASH audio+video cloud muxing and BotGuard bypass
const COBALT_INSTANCES = [
  "https://api.cobalt.tools",
  "https://cobalt.api.redstream.online",
  "https://capi.wuk.sh",
  "https://cobalt-backend.hyper.lol",
  "https://cobalt.toolforge.org",
];

// Helper: Query Cobalt cloud muxing across redundant instances
async function resolveViaCobalt(targetUrl: string, quality: string, isAudio: boolean): Promise<{ url: string; filename?: string } | null> {
  const qualityClean = quality.toLowerCase().replace(/[^0-9]/g, "") || "1080";

  for (const instance of COBALT_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6500);

      // 1. Try modern Cobalt v10 specification (POST /)
      const res = await fetch(`${instance}/`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "User-Agent": "StreamVaultPRO/2.0",
        },
        body: JSON.stringify({
          url: targetUrl,
          videoQuality: qualityClean,
          audioFormat: "mp3",
          downloadMode: isAudio ? "audio" : "auto",
        }),
      }).catch(() => null);

      clearTimeout(timeoutId);

      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data && (data.status === "tunnel" || data.status === "redirect" || data.status === "stream") && data.url) {
          console.log(`[Cobalt v10] Instance ${instance} successfully resolved stream`);
          return { url: data.url, filename: data.filename };
        }
      }

      // 2. Try legacy Cobalt v7 specification (POST /api/json)
      const controllerV7 = new AbortController();
      const timeoutIdV7 = setTimeout(() => controllerV7.abort(), 5500);

      const resV7 = await fetch(`${instance}/api/json`, {
        method: "POST",
        signal: controllerV7.signal,
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "User-Agent": "StreamVaultPRO/2.0",
        },
        body: JSON.stringify({
          url: targetUrl,
          vQuality: qualityClean,
          isAudioOnly: isAudio,
          aFormat: "mp3",
        }),
      }).catch(() => null);

      clearTimeout(timeoutIdV7);

      if (resV7 && resV7.ok) {
        const dataV7 = await resV7.json().catch(() => null);
        if (dataV7 && (dataV7.status === "stream" || dataV7.status === "redirect" || dataV7.status === "tunnel") && dataV7.url) {
          console.log(`[Cobalt v7] Instance ${instance} successfully resolved stream`);
          return { url: dataV7.url, filename: dataV7.filename };
        }
      }
    } catch (err: any) {
      console.warn(`[Cobalt Warn] Instance ${instance} check failed:`, err?.message || err);
    }
  }
  return null;
}

// Helper: Innertube with ANDROID mobile client emulation (immune to Web BotGuard challenge)
async function resolveViaInnertube(videoId: string, isAudio: boolean, quality: string) {
  const cookie = Deno.env.get("YOUTUBE_COOKIE") || defaultCookie;
  let yt: any = null;

  try {
    yt = await Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true,
      client_type: "ANDROID",
      cookie: cookie,
    });
  } catch (_) {
    yt = await Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true,
      client_type: "IOS",
    });
  }

  const video = await yt.getBasicInfo(videoId, "ANDROID");
  const streamingData = video.streaming_data;
  if (!streamingData) {
    throw new Error("No streaming data available from Innertube");
  }

  const formats = streamingData.formats || [];
  const adaptive = streamingData.adaptive_formats || [];
  let chosenFmt = null;

  if (isAudio) {
    const audioFormats = adaptive.filter((f: any) => f.has_audio);
    audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
    chosenFmt = audioFormats[0] || formats.find((f: any) => f.has_audio);
  } else {
    const prog = formats.filter((f: any) => f.has_video && f.has_audio);
    const targetH = parseInt(quality.replace(/[^0-9]/g, "") || "720");
    const exactProg = prog.find((f: any) => f.height === targetH);
    if (exactProg) {
      chosenFmt = exactProg;
    } else if (prog.length > 0) {
      prog.sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
      chosenFmt = prog[0];
    } else {
      const vAdaptive = adaptive.filter((f: any) => f.has_video);
      chosenFmt = vAdaptive.find((f: any) => f.height === targetH) || vAdaptive[0];
    }
  }

  if (!chosenFmt) {
    throw new Error("No candidate format available for requested quality");
  }

  let streamUrl = chosenFmt.url;
  if (!streamUrl && typeof chosenFmt.decipher === "function") {
    streamUrl = chosenFmt.decipher(yt.session.player);
  }

  if (!streamUrl) {
    throw new Error("Could not decipher format URL");
  }

  return {
    streamUrl,
    mimeType: chosenFmt.mime_type?.split(";")[0] || (isAudio ? "audio/mp4" : "video/mp4"),
    headers: {
      "User-Agent": "com.google.android.youtube/19.09.37 (Linux; U; Android 11; Pixel 5) gzip",
      "Origin": "https://www.youtube.com",
      "Referer": "https://www.youtube.com/",
    },
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const reqUrl = new URL(req.url);

    // ─────────────────────────────────────────────────────────────
    // ── GET: Direct Binary Streaming to Browser ──────────────────
    // ─────────────────────────────────────────────────────────────
    if (req.method === "GET") {
      const videoUrl = reqUrl.searchParams.get("url") || "";
      const formatUrl = reqUrl.searchParams.get("format_url");
      const isAudio = reqUrl.searchParams.get("audio") === "true";
      const quality = reqUrl.searchParams.get("quality") || "1080p";
      let customFilename = reqUrl.searchParams.get("filename") || (isAudio ? "audio.mp3" : "video.mp4");

      // 1. Direct social media format URL
      if (formatUrl) {
        try {
          const streamRes = await fetch(formatUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Referer": videoUrl || "https://www.google.com/",
            },
          });
          if (streamRes.ok && streamRes.body) {
            const headers = new Headers(corsHeaders);
            headers.set("Content-Type", isAudio ? "audio/mpeg" : (streamRes.headers.get("Content-Type") || "video/mp4"));
            headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(customFilename)}"; filename*=UTF-8''${encodeURIComponent(customFilename)}`);
            return new Response(streamRes.body, { headers });
          }
        } catch (fErr: any) {
          console.warn("[Format Proxy Error]:", fErr.message);
        }
      }

      if (!videoUrl) {
        return new Response(JSON.stringify({
          success: false,
          error: { code: "MISSING_URL", message: "Missing video URL parameter", desktopFallback: false },
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 2. Primary Engine: Cobalt Cloud Muxing (for 1080p, 4K, MP3 & Botguard Bypass)
      try {
        const cobaltData = await resolveViaCobalt(videoUrl, quality, isAudio);
        if (cobaltData && cobaltData.url) {
          const streamRes = await fetch(cobaltData.url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
          });
          if (streamRes.ok && streamRes.body) {
            const headers = new Headers(corsHeaders);
            headers.set("Content-Type", isAudio ? "audio/mpeg" : (streamRes.headers.get("Content-Type") || "video/mp4"));
            headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(customFilename)}"; filename*=UTF-8''${encodeURIComponent(customFilename)}`);
            return new Response(streamRes.body, { headers });
          }
        }
      } catch (cErr: any) {
        console.warn("[Cobalt Stream Error]:", cErr.message);
      }

      // 3. Fallback Engine: Innertube Android App Emulation
      const ytMatch = videoUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (ytMatch) {
        const videoId = ytMatch[1];
        try {
          const streamInfo = await resolveViaInnertube(videoId, isAudio, quality);
          const ytRes = await fetch(streamInfo.streamUrl, { headers: streamInfo.headers });
          if (ytRes.ok && ytRes.body) {
            const headers = new Headers(corsHeaders);
            headers.set("Content-Type", streamInfo.mimeType);
            headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(customFilename)}"; filename*=UTF-8''${encodeURIComponent(customFilename)}`);
            return new Response(ytRes.body, { headers });
          }
        } catch (itErr: any) {
          console.error("[Innertube Fallback Error]:", itErr.message);
        }
      }

      // If all cloud attempts failed
      return new Response(JSON.stringify({
        success: false,
        error: {
          code: "CLOUD_EXTRACTION_UNAVAILABLE",
          message: "Could not retrieve direct media stream from cloud server. Please try another quality or check YouTube availability.",
          retryable: true,
          desktopFallback: true,
        },
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─────────────────────────────────────────────────────────────
    // ── POST: Generate Stream Download URL ───────────────────────
    // ─────────────────────────────────────────────────────────────
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const url = body.url || "";
      const quality = body.quality || "1080p";
      const format = body.format || "video";
      const isAudio = format === "audio" || format === "mp3";
      const formatUrl = body.format_url;
      let filename = body.filename || `StreamVault_${Date.now()}.${isAudio ? "mp3" : "mp4"}`;

      if (!filename.toLowerCase().endsWith(".mp3") && !filename.toLowerCase().endsWith(".mp4")) {
        filename += isAudio ? ".mp3" : ".mp4";
      }

      if (!url && !formatUrl) {
        return new Response(JSON.stringify({
          success: false,
          error: { code: "MISSING_URL", message: "Missing URL parameter", desktopFallback: false },
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const projectRef = "sjnamkshicpxtyikzsnp";
      const edgeBase = `https://${projectRef}.supabase.co/functions/v1/download`;

      // Build proxy URL that points back to this Edge Function's GET stream route
      let proxyUrl = "";
      if (formatUrl) {
        proxyUrl = `${edgeBase}?format_url=${encodeURIComponent(formatUrl)}&filename=${encodeURIComponent(filename)}&audio=${isAudio}&quality=${encodeURIComponent(quality)}`;
      } else {
        proxyUrl = `${edgeBase}?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}&audio=${isAudio}&quality=${encodeURIComponent(quality)}`;
      }

      return new Response(JSON.stringify({
        success: true,
        downloadUrl: proxyUrl,
        filename: filename,
        quality: quality,
        format: isAudio ? "mp3" : "mp4",
        via: "cloud-stream",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (err: any) {
    console.error("[Download Top-Level Error]:", err);
    return new Response(JSON.stringify({
      success: false,
      error: {
        code: "EDGE_FUNCTION_ERROR",
        message: err?.message || "Internal download function error",
        retryable: true,
        desktopFallback: true,
      },
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
