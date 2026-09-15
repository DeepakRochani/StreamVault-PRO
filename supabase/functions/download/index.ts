import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Innertube, Platform, UniversalCache } from "npm:youtubei.js@latest";

// Configure JavaScript interpreter shim for YouTube decipher algorithms
if (Platform && Platform.shim) {
  Platform.shim.eval = async (data: any) => {
    return new Function(data.output)();
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

let innertubeClient: any = null;

async function getInnertube() {
  if (!innertubeClient) {
    try {
      innertubeClient = await Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true
      });
    } catch (err) {
      console.error("Failed to init Innertube:", err);
      // Try minimal create
      innertubeClient = await Innertube.create();
    }
  }
  return innertubeClient;
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

    // 2. YouTube streaming
    const ytMatch = videoUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      const videoId = ytMatch[1];
      let lastErr = "";

      try {
        const yt = await getInnertube();
        const video = await yt.getInfo(videoId);

        const safeTitle = (video.basic_info?.title || "download").replace(/[/\\?%*:|"<>]/g, '-');
        let stream: any = null;
        let mimeType = "video/mp4";
        customFilename = `${safeTitle}.mp4`;

        // Attempt 1: Innertube download method
        try {
          if (isAudio) {
            try {
              stream = await video.download({ type: "audio", quality: "best" });
              mimeType = "audio/mp4";
              customFilename = `${safeTitle}.m4a`;
            } catch (aErr: any) {
              console.warn("Audio download attempt failed:", aErr.message);
            }
          }

          if (!stream) {
            stream = await video.download({ type: "video+audio", quality: "best" });
            mimeType = "video/mp4";
            customFilename = `${safeTitle}.mp4`;
          }
        } catch (dErr: any) {
          console.warn("video.download failed, attempting direct format stream:", dErr.message);
        }

        // Attempt 2: Direct format stream from streaming_data
        if (!stream && video.streaming_data) {
          const formatList = [
            ...(video.streaming_data.formats || []),
            ...(video.streaming_data.adaptive_formats || [])
          ];

          for (const fmt of formatList) {
            try {
              let streamUrl = fmt.url;
              if (!streamUrl && typeof fmt.decipher === "function") {
                try { streamUrl = fmt.decipher(yt.session.player); } catch (_) {}
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
                  mimeType = fmt.mime_type?.split(';')[0] || "video/mp4";
                  break;
                }
              }
            } catch (fErr: any) {
              console.warn("Format candidate failed:", fErr.message);
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

      return new Response(JSON.stringify({ 
        error: `Edge streaming error: ${lastErr}. Please use the StreamVault Desktop App for full offline downloads.` 
      }), { 
        status: 502, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
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
