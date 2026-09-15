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

async function createInnertubeWithClient(clientType: "TV_EMBEDDED" | "IOS" | "ANDROID" | "WEB") {
  const cookie = Deno.env.get("YOUTUBE_COOKIE") || defaultCookie;
  return await Innertube.create({
    cache: new UniversalCache(false),
    generate_session_locally: true,
    retrieve_player: true,
    client_type: clientType,
    cookie: cookie
  });
}

// Multi-client extraction helper
async function getYouTubeStream(videoId: string, isAudio: boolean) {
  const clients: Array<"TV_EMBEDDED" | "IOS" | "ANDROID" | "WEB"> = ["TV_EMBEDDED", "IOS", "ANDROID", "WEB"];
  let lastError = "";

  for (const clientType of clients) {
    try {
      const yt = await createInnertubeWithClient(clientType);
      const videoInfo = await yt.getBasicInfo(videoId);
      const safeTitle = (videoInfo.basic_info?.title || "download").replace(/[/\\?%*:|"<>]/g, '-');
      let stream: any = null;
      let mimeType = isAudio ? "audio/mp4" : "video/mp4";

      // Try video.download()
      try {
        if (isAudio) {
          stream = await videoInfo.download({ type: "audio", quality: "best" });
          mimeType = "audio/mp4";
        } else {
          stream = await videoInfo.download({ type: "video+audio", quality: "best" });
          mimeType = "video/mp4";
        }
      } catch (err: any) {
        lastError = err.message || String(err);
      }

      // Try raw streaming data formats
      if (!stream && videoInfo.streaming_data) {
        const formatList = isAudio
          ? [...(videoInfo.streaming_data.adaptive_formats || []).filter((f: any) => f.has_audio), ...(videoInfo.streaming_data.formats || [])]
          : [...(videoInfo.streaming_data.formats || []), ...(videoInfo.streaming_data.adaptive_formats || [])];

        for (const fmt of formatList) {
          try {
            let streamUrl = fmt.url;
            if (!streamUrl && typeof fmt.decipher === "function") {
              try { streamUrl = fmt.decipher(yt.session.player); } catch (cErr: any) { lastError = cErr.message; }
            }
            if (streamUrl) {
              const fetched = await fetch(streamUrl, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                  "Referer": "https://www.youtube.com/"
                }
              });
              if (fetched.ok && fetched.body) {
                return {
                  stream: fetched.body,
                  mimeType: fmt.mime_type?.split(';')[0] || mimeType,
                  filename: `${safeTitle}.${isAudio ? "m4a" : "mp4"}`
                };
              }
            }
          } catch (fErr: any) {
            lastError = fErr.message;
          }
        }
      }

      if (stream) {
        return {
          stream,
          mimeType,
          filename: `${safeTitle}.${isAudio ? "m4a" : "mp4"}`
        };
      }
    } catch (clientErr: any) {
      lastError = clientErr.message || String(clientErr);
      console.warn(`Innertube client ${clientType} failed:`, lastError);
    }
  }

  throw new Error(lastError || "YouTube stream could not be extracted with current cloud IP");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const reqUrl = new URL(req.url);

  // ── GET: Stream file to client ────────────────────────────────
  if (req.method === "GET") {
    const videoUrl = reqUrl.searchParams.get("url");
    const formatUrl = reqUrl.searchParams.get("format_url");
    const isAudio = reqUrl.searchParams.get("audio") === "true";
    let customFilename = reqUrl.searchParams.get("filename") || (isAudio ? "audio.mp3" : "video.mp4");

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
          return new Response(`Stream Error: ${streamRes.statusText}`, { status: 502, headers: corsHeaders });
        }
        const headers = new Headers(corsHeaders);
        headers.set("Content-Type", isAudio ? "audio/mpeg" : (streamRes.headers.get("Content-Type") || "video/mp4"));
        headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(customFilename)}"`);
        return new Response(streamRes.body, { headers });
      } catch (err: any) {
        return new Response(`Proxy Stream Error: ${err.message}`, { status: 500, headers: corsHeaders });
      }
    }

    if (!videoUrl) {
      return new Response("Missing video URL", { status: 400, headers: corsHeaders });
    }

    // 2. YouTube streaming with multi-client fallback
    const ytMatch = videoUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      const videoId = ytMatch[1];

      try {
        const result = await getYouTubeStream(videoId, isAudio);
        const headers = new Headers(corsHeaders);
        headers.set("Content-Type", result.mimeType);
        headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(result.filename)}"`);
        return new Response(result.stream, { headers });
      } catch (e: any) {
        const errorMsg = e.message || String(e);
        console.error("All YouTube extraction strategies failed:", errorMsg);

        let friendlyError = errorMsg;
        if (
          friendlyError.toLowerCase().includes("login") || 
          friendlyError.toLowerCase().includes("sign in") ||
          friendlyError.toLowerCase().includes("bot") ||
          friendlyError.toLowerCase().includes("403") ||
          friendlyError.toLowerCase().includes("400")
        ) {
          friendlyError = "This video is restricted or requires YouTube account login/cookies. Please use the StreamVault Desktop App for unrestricted 4K/1080p downloads.";
        }

        return new Response(JSON.stringify({ 
          error: friendlyError 
        }), { 
          status: 502, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
    }

    return new Response(JSON.stringify({ error: "Invalid video URL" }), { 
      status: 400, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }

  // ── POST: Generate Stream Download URL ─────────────────────────
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const url = body.url;
      const format = body.format;
      const isAudio = format === 'audio' || format === 'mp3';
      const formatUrl = body.format_url;
      let filename = body.filename || `download.${isAudio ? "mp3" : "mp4"}`;
      if (!filename.toLowerCase().endsWith('.mp3') && !filename.toLowerCase().endsWith('.mp4')) {
        filename += isAudio ? '.mp3' : '.mp4';
      }

      if (!url && !formatUrl) {
        return new Response(JSON.stringify({ error: "Missing URL" }), { 
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      const projectRef = "sjnamkshicpxtyikzsnp";
      const edgeBase = `https://${projectRef}.supabase.co/functions/v1/download`;

      if (formatUrl) {
        const proxyUrl = `${edgeBase}?format_url=${encodeURIComponent(formatUrl)}&filename=${encodeURIComponent(filename)}&audio=${isAudio}`;
        return new Response(JSON.stringify({
          success: true,
          downloadUrl: proxyUrl,
          directUrl: formatUrl,
          filename: filename,
          via: "direct-format"
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Check YouTube URLs
      const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (ytMatch) {
        const videoId = ytMatch[1];
        // Pre-check YouTube video availability
        try {
          const clients: Array<"TV_EMBEDDED" | "IOS" | "ANDROID" | "WEB"> = ["TV_EMBEDDED", "IOS", "ANDROID", "WEB"];
          let playableFound = false;
          let safeTitle = filename.replace(/\.(mp3|mp4|m4a)$/i, '');

          for (const clientType of clients) {
            try {
              const yt = await createInnertubeWithClient(clientType);
              const info = await yt.getBasicInfo(videoId);
              if (info.basic_info?.title) {
                safeTitle = info.basic_info.title.replace(/[/\\?%*:|"<>]/g, '-');
              }
              if (info.streaming_data?.formats?.length || info.streaming_data?.adaptive_formats?.length) {
                playableFound = true;
                break;
              }
            } catch (_) {
              // Try next client
            }
          }

          filename = `${safeTitle}.${isAudio ? "m4a" : "mp4"}`;
        } catch (_) {}
      }

      const proxyUrl = `${edgeBase}?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}&audio=${isAudio}`;
      return new Response(JSON.stringify({
        success: true,
        downloadUrl: proxyUrl,
        filename: filename,
        via: "innertube-stream"
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), { 
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
});
