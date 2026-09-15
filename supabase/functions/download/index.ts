import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const reqUrl = new URL(req.url);

  // GET request: Stream/Proxy the file back to the browser for direct download
  if (req.method === "GET") {
    const videoUrl = reqUrl.searchParams.get("url");
    const formatUrl = reqUrl.searchParams.get("format_url");
    const isAudio = reqUrl.searchParams.get("audio") === "true";
    const customFilename = reqUrl.searchParams.get("filename") || "download";

    // 1. Direct format URL proxy
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

    // 2. YouTube stream proxying
    try {
      const ytMatch = videoUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (ytMatch) {
        const videoId = ytMatch[1];
        const pipedInstances = [
          `https://pipedapi.kavin.rocks/streams/${videoId}`,
          `https://api.piped.privacydev.net/streams/${videoId}`,
          `https://piped-api.lunar.icu/streams/${videoId}`
        ];

        for (const inst of pipedInstances) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            const res = await fetch(inst, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) {
              const data = await res.json();
              const streams = isAudio ? (data.audioStreams || []) : (data.videoStreams || data.audioStreams || []);
              if (streams && streams.length > 0) {
                const chosen = streams[0]?.url;
                if (chosen) {
                  const mediaRes = await fetch(chosen);
                  if (mediaRes.ok) {
                    const headers = new Headers(corsHeaders);
                    headers.set("Content-Type", isAudio ? "audio/mpeg" : "video/mp4");
                    headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(customFilename)}"`);
                    return new Response(mediaRes.body, { headers });
                  }
                }
              }
            }
          } catch (_) { /* try next */ }
        }
      }

      return new Response(JSON.stringify({ error: "Stream unavailable on serverless edge. Please use desktop version." }), { 
        status: 502, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    } catch (err: any) {
      return new Response(`Stream Error: ${err.message}`, { status: 500, headers: corsHeaders });
    }
  }

  // POST request: Resolve download URL
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

      // Determine correct project reference domain
      const projectRef = "sjnamkshicpxtyikzsnp";
      const edgeBase = `https://${projectRef}.supabase.co/functions/v1/download`;

      // 1. Direct format URL provided (e.g. social platforms or direct media)
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

      // 2. YouTube URL
      const ytMatch = (url || "").match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (ytMatch) {
        const videoId = ytMatch[1];
        const proxyUrl = `${edgeBase}?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}&audio=${isAudio}`;

        let directMediaUrl = null;
        const pipedInstances = [
          `https://pipedapi.kavin.rocks/streams/${videoId}`,
          `https://api.piped.privacydev.net/streams/${videoId}`
        ];

        for (const inst of pipedInstances) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(inst, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) {
              const data = await res.json();
              const streams = isAudio ? (data.audioStreams || []) : (data.videoStreams || []);
              if (streams && streams.length > 0) {
                directMediaUrl = streams[0]?.url;
                if (directMediaUrl) break;
              }
            }
          } catch (_) {}
        }

        return new Response(JSON.stringify({
          success: true,
          downloadUrl: directMediaUrl || proxyUrl,
          filename: filename,
          via: directMediaUrl ? "piped-stream" : "edge-proxy"
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 3. Default fallback proxy
      const proxyUrl = `${edgeBase}?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}&audio=${isAudio}`;
      return new Response(JSON.stringify({
        success: true,
        downloadUrl: proxyUrl,
        filename: filename,
        via: "edge-proxy"
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), { 
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
});
