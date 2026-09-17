import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Innertube, Platform, UniversalCache } from "npm:youtubei.js@latest";

// Configure JavaScript interpreter shim for YouTube decipher algorithms
if (Platform && Platform.shim) {
  Platform.shim.eval = async (code: any, env: any = {}) => {
    try {
      const rawCode = typeof code === "string" ? code : (code?.output || code?.code || String(code));
      const keys = Object.keys(env || {});
      const values = Object.values(env || {});
      const fn = new Function(...keys, rawCode);
      return fn(...values);
    } catch (evalErr) {
      console.error("Shim eval error:", evalErr);
      throw evalErr;
    }
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const defaultCookie = "GPS=1; PREF=hl=en&tz=UTC; SOCS=CAI; VISITOR_INFO1_LIVE=zjW6Y_RzRUI; VISITOR_PRIVACY_METADATA=CgJJThIEGgAgGg%3D%3D; YSC=JNKtOAO-9B4; __Secure-ROLLOUT_TOKEN=CMS3w9CquMO7HBDkkLrOjZiVAxjy_IHdjZiVAw%3D%3D";

// Reuse a single cached instance across warm Edge invocations to save CPU and Memory
let cachedInnertube: any = null;

async function getInnertube() {
  if (!cachedInnertube) {
    const cookie = Deno.env.get("YOUTUBE_COOKIE") || defaultCookie;
    try {
      cachedInnertube = await Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true,
        cookie: cookie
      });
    } catch (err: any) {
      console.warn("Innertube session creation warning:", err.message);
      cachedInnertube = await Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true
      });
    }
  }
  return cachedInnertube;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const reqUrl = new URL(req.url);

    // ── GET: Stream file to client ────────────────────────────────
    if (req.method === "GET") {
      const videoUrl = reqUrl.searchParams.get("url");
      const formatUrl = reqUrl.searchParams.get("format_url");
      const isAudio = reqUrl.searchParams.get("audio") === "true";
      const quality = reqUrl.searchParams.get("quality") || "";
      let customFilename = reqUrl.searchParams.get("filename") || (isAudio ? "audio.mp3" : "video.mp4");

      // Check for high-res DASH qualities that cannot be merged without local FFmpeg
      if (!isAudio && (quality === "1080p" || quality === "1440p" || quality === "2160p" || quality === "4K")) {
        return new Response(JSON.stringify({
          success: false,
          error: {
            code: "CLOUD_DOWNLOAD_UNSUPPORTED",
            message: "1080p and 4K downloads require video/audio track merging. Continue in StreamVault Desktop.",
            retryable: false,
            desktopFallback: true,
            stage: "format_selection"
          }
        }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 1. Direct format URL proxy (e.g. Social media or direct CDN)
      if (formatUrl) {
        try {
          const streamRes = await fetch(formatUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Referer": videoUrl || "https://google.com/"
            }
          });
          if (!streamRes.ok) {
            return new Response(JSON.stringify({
              success: false,
              error: {
                code: "PROXY_STREAM_ERROR",
                message: `Stream Error: ${streamRes.statusText}`,
                retryable: true,
                desktopFallback: true
              }
            }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const headers = new Headers(corsHeaders);
          headers.set("Content-Type", isAudio ? "audio/mpeg" : (streamRes.headers.get("Content-Type") || "video/mp4"));
          headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(customFilename)}"`);
          return new Response(streamRes.body, { headers });
        } catch (err: any) {
          return new Response(JSON.stringify({
            success: false,
            error: {
              code: "PROXY_FETCH_FAILED",
              message: `Proxy Stream Error: ${err.message}`,
              retryable: true,
              desktopFallback: true
            }
          }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      if (!videoUrl) {
        return new Response(JSON.stringify({
          success: false,
          error: {
            code: "MISSING_URL",
            message: "Missing video URL",
            retryable: false,
            desktopFallback: false
          }
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 2. YouTube streaming
      const ytMatch = videoUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (ytMatch) {
        const videoId = ytMatch[1];
        let lastErr = "";
        let isBotOrAuth = false;

        try {
          const yt = await getInnertube();
          const video = await yt.getBasicInfo(videoId);
          const safeTitle = (video.basic_info?.title || "download").replace(/[/\\?%*:|"<>]/g, '-');
          let stream: any = null;
          let mimeType = isAudio ? "audio/mp4" : "video/mp4";
          customFilename = `${safeTitle}.${isAudio ? "m4a" : "mp4"}`;

        // Attempt 1: Innertube video.download()
        try {
          stream = await video.download({ type: "video+audio", quality: "best" });
          mimeType = isAudio ? "audio/mp4" : "video/mp4";
        } catch (dErr: any) {
          lastErr = dErr.message || String(dErr);
        }

        // Attempt 2: Direct format candidate fallback
        if (!stream && video.streaming_data) {
          const formatList = isAudio
            ? [...(video.streaming_data.adaptive_formats || []).filter((f: any) => f.has_audio), ...(video.streaming_data.formats || [])]
            : [...(video.streaming_data.formats || []), ...(video.streaming_data.adaptive_formats || [])];

          for (const fmt of formatList) {
            try {
              let streamUrl = fmt.url;
              if (!streamUrl && typeof fmt.decipher === "function") {
                try { streamUrl = fmt.decipher(yt.session.player); } catch (cErr: any) { lastErr = cErr.message; }
              }
              if (streamUrl) {
                const fetched = await fetch(streamUrl, {
                  headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Referer": "https://www.youtube.com/"
                  }
                });
                if (fetched.ok && fetched.body) {
                  stream = fetched.body;
                  mimeType = fmt.mime_type?.split(';')[0] || mimeType;
                  break;
                }
              }
            } catch (fErr: any) {
              lastErr = fErr.message;
            }
          }
        }

        if (stream) {
          const headers = new Headers(corsHeaders);
          headers.set("Content-Type", mimeType);
          headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(customFilename)}"`);
          return new Response(stream, { headers });
        }
        } catch (e: any) {
          lastErr = e.message || String(e);
          console.error("Innertube streaming error:", e);
        }

        const errLower = (lastErr || "").toLowerCase();
        isBotOrAuth = errLower.includes("login") || 
                      errLower.includes("sign in") || 
                      errLower.includes("bot") || 
                      errLower.includes("403") || 
                      errLower.includes("400") ||
                      errLower.includes("private") ||
                      errLower.includes("restricted");

        return new Response(JSON.stringify({ 
          success: false,
          error: {
            code: isBotOrAuth ? "YOUTUBE_BOT_CHALLENGE" : "CLOUD_EXTRACTION_FAILED",
            message: isBotOrAuth
              ? "YouTube requires additional verification for this video from the cloud server. You can continue with StreamVault Desktop using your local connection."
              : (lastErr || "Failed to extract playable stream from cloud server."),
            retryable: !isBotOrAuth,
            desktopFallback: true,
            httpStatus: isBotOrAuth ? 403 : 502
          }
        }), { 
          status: isBotOrAuth ? 403 : 502, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      return new Response(JSON.stringify({
        success: false,
        error: {
          code: "INVALID_URL",
          message: "Invalid video URL",
          retryable: false,
          desktopFallback: false
        }
      }), { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

  // ── POST: Generate Stream Download URL ─────────────────────────
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const url = body.url;
      const quality = body.quality || "";
      const format = body.format;
      const isAudio = format === 'audio' || format === 'mp3';
      const formatUrl = body.format_url;
      let filename = body.filename || `download.${isAudio ? "mp3" : "mp4"}`;
      if (!filename.toLowerCase().endsWith('.mp3') && !filename.toLowerCase().endsWith('.mp4')) {
        filename += isAudio ? '.mp3' : '.mp4';
      }

      if (!url && !formatUrl) {
        return new Response(JSON.stringify({
          success: false,
          error: {
            code: "MISSING_URL",
            message: "Missing URL parameter",
            retryable: false,
            desktopFallback: false
          }
        }), { 
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      // Check for high-res DASH qualities that cannot be merged without local FFmpeg
      if (!isAudio && (quality === "1080p" || quality === "1440p" || quality === "2160p" || quality === "4K")) {
        return new Response(JSON.stringify({
          success: false,
          error: {
            code: "CLOUD_DOWNLOAD_UNSUPPORTED",
            message: "1080p and 4K downloads require video/audio track merging. Continue in StreamVault Desktop.",
            retryable: false,
            desktopFallback: true,
            stage: "format_selection"
          }
        }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const projectRef = "sjnamkshicpxtyikzsnp";
      const edgeBase = `https://${projectRef}.supabase.co/functions/v1/download`;

      if (formatUrl) {
        const proxyUrl = `${edgeBase}?format_url=${encodeURIComponent(formatUrl)}&filename=${encodeURIComponent(filename)}&audio=${isAudio}&quality=${encodeURIComponent(quality)}`;
        return new Response(JSON.stringify({
          success: true,
          downloadUrl: proxyUrl,
          directUrl: formatUrl,
          filename: filename,
          via: "direct-format"
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const proxyUrl = `${edgeBase}?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}&audio=${isAudio}&quality=${encodeURIComponent(quality)}`;
      return new Response(JSON.stringify({
        success: true,
        downloadUrl: proxyUrl,
        filename: filename,
        via: "innertube-stream"
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      } catch (err: any) {
        return new Response(JSON.stringify({
          success: false,
          error: {
            code: "SERVER_ERROR",
            message: err.message,
            retryable: true,
            desktopFallback: true
          }
        }), { 
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (outerErr: any) {
    console.error("Top-level serve error:", outerErr);
    return new Response(JSON.stringify({
      success: false,
      error: {
        code: "UNHANDLED_EDGE_ERROR",
        message: outerErr?.message || "Internal edge function error",
        retryable: true,
        desktopFallback: true
      }
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
