import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import ytdl from "npm:@distube/ytdl-core@latest";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // GET request: Proxy the stream back to the browser
  if (req.method === "GET") {
    const url = new URL(req.url);
    const videoUrl = url.searchParams.get("url");
    const isAudio = url.searchParams.get("audio") === "true";

    if (!videoUrl || !ytdl.validateURL(videoUrl)) {
      return new Response("Invalid or missing YouTube URL", { status: 400 });
    }

    try {
      const info = await ytdl.getInfo(videoUrl);
      const format = ytdl.chooseFormat(info.formats, { 
          quality: isAudio ? 'highestaudio' : 'highest',
          filter: isAudio ? 'audioonly' : 'audioandvideo' 
      });

      if (!format || !format.url) {
          return new Response("Format not found", { status: 404 });
      }

      const videoRes = await fetch(format.url);
      if (!videoRes.ok) {
          return new Response(`Failed to fetch stream: ${videoRes.statusText}`, { status: 502 });
      }

      const headers = new Headers(corsHeaders);
      headers.set("Content-Type", isAudio ? "audio/mpeg" : "video/mp4");
      
      const safeTitle = (info.videoDetails.title || "download").replace(/[^a-z0-9]/gi, '_').toLowerCase();
      headers.set("Content-Disposition", `attachment; filename="${safeTitle}.${isAudio ? "mp3" : "mp4"}"`);

      // Proxy the ReadableStream directly to the client!
      return new Response(videoRes.body, { headers });
    } catch (err: any) {
      console.error("GET Stream Error:", err);
      return new Response(`Stream Error: ${err.message}`, { status: 500 });
    }
  }

  // POST request: Return the download URL (which points to the GET handler)
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const url = body.url;
      const format = body.format;
      
      if (!url) {
        return new Response(JSON.stringify({ error: "Missing URL" }), { 
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      if (ytdl.validateURL(url)) {
          const reqUrl = new URL(req.url);
          // Point back to this same Edge Function but as a GET request
          const proxyUrl = `${reqUrl.origin}${reqUrl.pathname}?url=${encodeURIComponent(url)}&audio=${format === 'audio'}`;
          
          return new Response(JSON.stringify({
             success: true,
             downloadUrl: proxyUrl,
             filename: `download.${format === "audio" ? "mp3" : "mp4"}`,
             via: "ytdl-core"
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } else {
          return new Response(JSON.stringify({ 
              error: "Only YouTube links are supported in this free deployment. Cobalt API is down." 
          }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } catch (err: any) {
      console.error("POST Error:", err);
      return new Response(JSON.stringify({ error: err.message }), { 
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
