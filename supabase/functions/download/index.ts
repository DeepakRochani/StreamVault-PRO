import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Innertube, UniversalCache } from "npm:youtubei.js@latest";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

let innertubeClient: any = null;

async function getInnertube() {
  if (!innertubeClient) {
    innertubeClient = await Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true,
      client_type: "ANDROID"
    });
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

    // 2. YouTube streaming
    const ytMatch = videoUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      const videoId = ytMatch[1];

      try {
        const yt = await getInnertube();
        const info = await yt.getInfo(videoId);
        
        let chosenFormat = null;
        if (isAudio) {
          chosenFormat = info.streaming_data?.adaptive_formats?.find((f: any) => f.mime_type?.startsWith("audio/mp4")) ||
                         info.streaming_data?.adaptive_formats?.find((f: any) => f.mime_type?.startsWith("audio/")) ||
                         info.chooseFormat({ type: "audio", quality: "best" });
        } else {
          chosenFormat = info.chooseFormat({ type: "video+audio", quality: "best" }) ||
                         info.streaming_data?.formats?.[0];
        }

        if (chosenFormat) {
          const directUrl = typeof chosenFormat.decipher === 'function' 
            ? chosenFormat.decipher(yt.session.player) 
            : (chosenFormat.url || yt.session.player.decipher(chosenFormat.signature_cipher || chosenFormat.cipher));

          if (directUrl) {
            const mediaRes = await fetch(directUrl, {
              headers: {
                "User-Agent": "com.google.android.youtube/19.29.37 (Linux; U; Android 11; en_US) gzip"
              }
            });
            if (mediaRes.ok && mediaRes.body) {
              const headers = new Headers(corsHeaders);
              headers.set("Content-Type", isAudio ? "audio/mpeg" : "video/mp4");
              headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(customFilename)}"`);
              return new Response(mediaRes.body, { headers });
            }
          }
        }
      } catch (innertubeErr) {
        console.warn("Innertube format deciphering failed:", innertubeErr);
      }

      try {
        const yt = await getInnertube();
        const stream = await yt.download(videoId, {
          type: isAudio ? "audio" : "video+audio",
          quality: "best"
        });

        const headers = new Headers(corsHeaders);
        headers.set("Content-Type", isAudio ? "audio/mpeg" : "video/mp4");
        headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(customFilename)}"`);
        return new Response(stream, { headers });
      } catch (downloadErr) {
        console.warn("Innertube yt.download failed:", downloadErr);
      }
    }

    return new Response(JSON.stringify({ 
      error: "Online serverless streaming could not fetch this video. Please download using the StreamVault Desktop App for unrestricted 4K/1080p downloads." 
    }), { 
      status: 502, 
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
