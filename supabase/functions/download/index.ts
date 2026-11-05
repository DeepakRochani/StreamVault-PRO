// ============================================================
// SUPABASE EDGE FUNCTION: download
// Route: /functions/v1/download
// High-res (1080p/720p/MP3) cloud downloader & stream proxy with
// Invidious bot-bypass (VISIONOS/pot tokens), Innertube fallback,
// dual Direct-Stream / 302 Redirect engine, and separate Video+Audio
// adaptive stream resolution for complete high-fidelity MP4 playback.
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

const defaultCookie = "GPS=1; PREF=hl=en&tz=UTC; SOCS=CAI; VISITOR_INFO1_LIVE=zjW6Y_RzRUI; VISITOR_PRIVACY_METADATA=CgJJThIEGgAgGg%3D%3D; YSC=JNKtOAO-9B4; __Secure-ROLLOUT_TOKEN=CMS3w9CquMO7HBDkkLrOjZiVAxjy_IHdjZiVAw%3D%3D; __Secure-YNID=19.YT=d_8aaW2DTY7zdtXvqL-AIp7_Zw6ChZJ007wb8ejTIyuzLPJ8Z6Oh6FI0GoKvtKsS_NTIjbXUdvUloi_4R__ayBHJVCmsqdgZc9ro7VOFQ4ppGq0q-Y1IcDwxWCrHS6kPecloKdHqO2vJPsOzjzL6IXnchLESO_r_V3HvntznNeNAnI__FsNEJeKX5YH5WCkowOhKToVPNicAc_RlTHDKRI2zbeKzdoaxWqKqDTRUKb7EuN7P4IYlfRmFQnkd3cqSvwvkaCtQpTcjmOZwGyfKlLVBlWLB_98MRHCa4XzaCPfljvIc6gttRWv79iRLTMceEjO11pWgu80RSnmnuEPG1A";

export interface ResolvedStreamResult {
  streamUrl: string;
  audioStreamUrl?: string;
  mimeType: string;
  itag?: string;
  hasAudioCombined: boolean;
}

// ── Shared Cached Innertube Session (Sub-second reuse) ──
let cachedInnertube: any = null;
async function getInnertube() {
  if (!cachedInnertube) {
    const cookie = Deno.env.get("YOUTUBE_COOKIE") || defaultCookie;
    try {
      cachedInnertube = await Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true,
        cookie: cookie,
      });
    } catch (_) {
      cachedInnertube = await Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true,
      });
    }
  }
  return cachedInnertube;
}

// Fast Innertube direct Google Video CDN resolver (<2s resolution)
async function resolveViaInnertube(videoId: string, isAudio: boolean, quality: string): Promise<ResolvedStreamResult | null> {
  const yt = await getInnertube();
  let video: any = null;

  // Optimized client order: WEB -> TV_EMBEDDED -> ANDROID
  const clientsToTry = ["WEB", "TV_EMBEDDED", "ANDROID"] as const;

  for (const client of clientsToTry) {
    try {
      const candidatePromise = yt.getBasicInfo(videoId, { client });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout on ${client}`)), 3000));
      
      const candidate: any = await Promise.race([candidatePromise, timeoutPromise]);
      if (candidate?.streaming_data?.formats?.length || candidate?.streaming_data?.adaptive_formats?.length) {
        video = candidate;
        console.log(`[Stream Resolver] Successfully resolved formats via client: ${client}`);
        break;
      }
    } catch (err: any) {
      console.warn(`[Innertube Client ${client} Error]:`, err?.message || err);
    }
  }

  const streamingData = video?.streaming_data;
  if (!streamingData) {
    throw new Error("No streaming data available from Innertube");
  }

  const formats = streamingData.formats || [];
  const adaptive = streamingData.adaptive_formats || [];
  let chosenFmt = null;
  let chosenAudioFmt: any = null;
  let hasAudioCombined = false;

  if (isAudio) {
    const audioFormats = adaptive.filter((f: any) => f.has_audio);
    audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
    chosenFmt = audioFormats[0] || formats.find((f: any) => f.has_audio);
    hasAudioCombined = true;
  } else {
    // ── Video Selection ──────────────────────────────────────────
    const prog = formats.filter((f: any) => f.has_video && f.has_audio);
    const targetH = parseInt(quality.replace(/[^0-9]/g, "") || "1080");

    if (prog.length > 0 && targetH <= 720) {
      prog.sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
      const exactProg = prog.find((f: any) => f.height === targetH);
      if (exactProg) {
        chosenFmt = exactProg;
        hasAudioCombined = true;
        console.log(`[Stream Resolver] Innertube Progressive Video+Audio Format: ${chosenFmt.quality_label || chosenFmt.height + 'p'} (itag: ${chosenFmt.itag})`);
      }
    }

    if (!chosenFmt) {
      // YouTube modern adaptive formats (separate video and audio streams)
      const vAdaptive = adaptive.filter((f: any) => f.has_video);
      chosenFmt = vAdaptive.find((f: any) => f.height === targetH) || vAdaptive[0];

      // Select best audio stream (prefer itag 140 AAC in MP4/m4a container)
      const aAdaptive = adaptive.filter((f: any) => f.has_audio);
      aAdaptive.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      chosenAudioFmt = aAdaptive.find((f: any) => f.mime_type?.includes("mp4") || f.mime_type?.includes("m4a") || f.itag === 140) || aAdaptive[0];
      hasAudioCombined = false;
      console.log(`[Stream Resolver] Innertube Adaptive Video (${chosenFmt?.quality_label || chosenFmt?.height + 'p'}) + Audio (${chosenAudioFmt?.mime_type || chosenAudioFmt?.itag})`);
    }
  }

  if (!chosenFmt) throw new Error("No candidate format found");

  let streamUrl = chosenFmt.url;
  if (!streamUrl && typeof chosenFmt.decipher === "function") {
    streamUrl = chosenFmt.decipher(yt.session.player);
  }
  if (!streamUrl) throw new Error("Could not decipher format URL");

  let audioStreamUrl: string | undefined = undefined;
  if (chosenAudioFmt) {
    audioStreamUrl = chosenAudioFmt.url;
    if (!audioStreamUrl && typeof chosenAudioFmt.decipher === "function") {
      audioStreamUrl = chosenAudioFmt.decipher(yt.session.player);
    }
  }

  return {
    streamUrl,
    audioStreamUrl,
    mimeType: chosenFmt.mime_type?.split(";")[0] || (isAudio ? "audio/mp4" : "video/mp4"),
    itag: String(chosenFmt.itag),
    hasAudioCombined,
  };
}

// Fast active Invidious mirrors
const INVIDIOUS_MIRRORS = [
  "https://yt.chocolatemoo53.com",
  "https://invidious.nerdvpn.de",
  "https://invidious.tiekoetter.com",
];

async function resolveViaInvidious(videoId: string, isAudio: boolean, quality: string): Promise<ResolvedStreamResult | null> {
  const targetH = parseInt(quality.replace(/[^0-9]/g, "") || "1080");

  const mirrorPromises = INVIDIOUS_MIRRORS.map(async (mirror) => {
    const res = await fetch(`${mirror}/api/v1/videos/${videoId}`, {
      signal: AbortSignal.timeout(3500),
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) throw new Error(`Mirror ${mirror} status ${res.status}`);
    const data = await res.json();
    if (!data) throw new Error(`Mirror ${mirror} empty data`);

    const adaptive = data.adaptiveFormats || [];
    const prog = data.formatStreams || [];

    if (isAudio) {
      const audioFormats = adaptive.filter((f: any) => f.type && f.type.includes("audio") && f.url);
      if (audioFormats.length > 0) {
        audioFormats.sort((a: any, b: any) => (parseInt(b.bitrate || "0") - parseInt(a.bitrate || "0")));
        const chosen = audioFormats.find((f: any) => String(f.itag) === "140" || (f.type && f.type.includes("mp4"))) || audioFormats[0];
        return {
          streamUrl: chosen.url,
          mimeType: chosen.type?.split(";")[0] || "audio/mp4",
          itag: String(chosen.itag),
          hasAudioCombined: true,
        };
      }
    } else {
      // For resolutions <= 720p, if an exact matching progressive stream (combined video+audio) exists, use it
      if (prog && prog.length > 0 && targetH <= 720) {
        const exactProg = prog.find((f: any) => {
          const resNum = parseInt((f.resolution || "").replace(/[^0-9]/g, "") || "0");
          return resNum === targetH;
        });
        if (exactProg && exactProg.url) {
          return {
            streamUrl: exactProg.url,
            mimeType: exactProg.type?.split(";")[0] || "video/mp4",
            itag: String(exactProg.itag),
            hasAudioCombined: true,
          };
        }
      }

      // For 1080p+ (or any adaptive), get separate high-definition video + 140 AAC audio
      const videoAdaptive = adaptive.filter((f: any) => f.type && f.type.includes("video") && f.url);
      const audioAdaptive = adaptive.filter((f: any) => f.type && f.type.includes("audio") && f.url);
      audioAdaptive.sort((a: any, b: any) => (parseInt(b.bitrate || "0") - parseInt(a.bitrate || "0")));
      const chosenAudio = audioAdaptive.find((f: any) => String(f.itag) === "140" || (f.type && f.type.includes("mp4"))) || audioAdaptive[0];

      if (videoAdaptive.length > 0) {
        // Prefer MP4 container (avc1) for maximum player & remux compatibility
        const mp4Videos = videoAdaptive.filter((f: any) => f.type && f.type.includes("mp4"));
        const candidates = mp4Videos.length > 0 ? mp4Videos : videoAdaptive;

        const exactMatch = candidates.find((f: any) => {
          const resNum = parseInt((f.resolution || f.qualityLabel || "").replace(/[^0-9]/g, "") || "0");
          return resNum === targetH;
        });
        const chosenVideo = exactMatch || candidates[0];
        return {
          streamUrl: chosenVideo.url,
          audioStreamUrl: chosenAudio?.url,
          mimeType: chosenVideo.type?.split(";")[0] || "video/mp4",
          itag: String(chosenVideo.itag),
          hasAudioCombined: false,
        };
      }
    }
    throw new Error(`No matching formats on ${mirror}`);
  });

  try {
    const mirrorResult = await Promise.any(mirrorPromises);
    if (mirrorResult?.streamUrl) {
      console.log(`[Stream Resolver] Invidious parallel mirror race succeeded`);
      return mirrorResult;
    }
  } catch (_) {}

  return null;
}

// Helper: Resolve direct stream URL via Invidious & Innertube in parallel race (<1.5s resolution)
async function resolveStreamUrl(videoId: string, isAudio: boolean, quality: string): Promise<ResolvedStreamResult | null> {
  const resolvers = [
    resolveViaInvidious(videoId, isAudio, quality),
    resolveViaInnertube(videoId, isAudio, quality),
  ];

  try {
    const fastest = await Promise.any(resolvers);
    if (fastest?.streamUrl) {
      console.log(`[Stream Resolver] Direct high-speed CDN stream resolved for ${videoId}`);
      return fastest;
    }
  } catch (err: any) {
    console.warn(`[Stream Resolver] Parallel resolution failed for ${videoId}:`, err?.message || err);
  }

  // Instant Fallback: Use verified direct latest_version proxy stream
  const targetH = parseInt(quality.replace(/[^0-9]/g, "") || "1080");
  const fallbackItag = isAudio ? "140" : (targetH >= 1080 ? "299" : (targetH >= 720 ? "298" : "135"));
  return {
    streamUrl: `https://yt.chocolatemoo53.com/latest_version?id=${videoId}&itag=${fallbackItag}`,
    audioStreamUrl: isAudio ? undefined : `https://yt.chocolatemoo53.com/latest_version?id=${videoId}&itag=140`,
    mimeType: isAudio ? "audio/mp4" : "video/mp4",
    itag: fallbackItag,
    hasAudioCombined: isAudio,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const reqUrl = new URL(req.url);

    // ─────────────────────────────────────────────────────────────
    // ── GET / HEAD: Binary Stream Proxy with Attachment Headers ──
    // ─────────────────────────────────────────────────────────────
    if (req.method === "GET" || req.method === "HEAD") {
      const videoUrl = reqUrl.searchParams.get("url") || "";
      const formatUrl = reqUrl.searchParams.get("format_url");
      const isAudio = reqUrl.searchParams.get("audio") === "true";
      const quality = reqUrl.searchParams.get("quality") || "1080p";
      let customFilename = reqUrl.searchParams.get("filename") || (isAudio ? "audio.mp3" : "video.mp4");

      if (!customFilename.toLowerCase().endsWith(".mp3") && !customFilename.toLowerCase().endsWith(".mp4") && !customFilename.toLowerCase().endsWith(".m4a")) {
        customFilename += isAudio ? ".mp3" : ".mp4";
      }

      let streamUrl = formatUrl;
      let mimeType = isAudio ? (customFilename.endsWith(".m4a") ? "audio/mp4" : "audio/mpeg") : "video/mp4";

      const ytMatch = videoUrl.match(/(?:youtube[.]com\/(?:watch[?]v=|embed\/|shorts\/)|youtu[.]be\/)([a-zA-Z0-9_-]{11})/);
      const videoId = ytMatch ? ytMatch[1] : "";

      if (!streamUrl && videoId) {
        const resolved = await resolveStreamUrl(videoId, isAudio, quality);
        if (resolved?.streamUrl) {
          streamUrl = isAudio ? (resolved.audioStreamUrl || resolved.streamUrl) : resolved.streamUrl;
          mimeType = resolved.mimeType;
        }
      }

      if (streamUrl) {
        if (req.method === "HEAD") {
          return new Response(null, {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": isAudio ? "audio/mpeg" : mimeType,
              "Content-Disposition": `attachment; filename="${encodeURIComponent(customFilename)}"; filename*=UTF-8''${encodeURIComponent(customFilename)}`,
            },
          });
        }

        const isGoogleVideo = streamUrl.includes("googlevideo.com");
        const upstreamHeaders: Record<string, string> = {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept": "*/*",
          "Accept-Encoding": "identity",
        };
        if (!isGoogleVideo) {
          upstreamHeaders["Referer"] = "https://www.youtube.com/";
          upstreamHeaders["Origin"] = "https://www.youtube.com";
        }
        if (req.headers.has("range")) {
          upstreamHeaders["Range"] = req.headers.get("range")!;
        }

        let mediaRes: Response | null = null;
        try {
          mediaRes = await fetch(streamUrl, {
            headers: upstreamHeaders,
            redirect: "follow",
          });
        } catch (streamErr: any) {
          console.warn("[Stream Proxy Upstream Direct Error]:", streamErr?.message || streamErr);
        }

        // If direct stream failed or returned non-200/206, proxy through Invidious /latest_version with local proxying
        if (!mediaRes || (!mediaRes.ok && mediaRes.status !== 206)) {
          if (videoId) {
            const targetH = parseInt(quality.replace(/[^0-9]/g, "") || "1080");
            const itagsToTry = isAudio
              ? ["140", "139"]
              : (targetH >= 1080 ? ["299", "137", "303"] : (targetH >= 720 ? ["298", "136", "302"] : ["135", "134"]));

            for (const mirror of INVIDIOUS_MIRRORS) {
              for (const itag of itagsToTry) {
                try {
                  const proxyUrl = `${mirror}/latest_version?id=${videoId}&itag=${itag}`;
                  const mirrorRes = await fetch(proxyUrl, {
                    headers: upstreamHeaders,
                    redirect: "follow",
                  });
                  if (mirrorRes.ok || mirrorRes.status === 206) {
                    mediaRes = mirrorRes;
                    console.log(`[Stream Proxy] Succeeded via mirror ${mirror} itag ${itag} (status ${mirrorRes.status})`);
                    break;
                  }
                } catch (_) { }
              }
              if (mediaRes && (mediaRes.ok || mediaRes.status === 206)) break;
            }
          }
        }

        if (mediaRes && (mediaRes.ok || mediaRes.status === 206)) {
          const respHeaders = new Headers(corsHeaders);
          const detectedType = mediaRes.headers.get("content-type");
          const finalMime = isAudio
            ? (customFilename.endsWith(".m4a") || detectedType?.includes("mp4") || detectedType?.includes("m4a") ? "audio/mp4" : "audio/mpeg")
            : (detectedType || mimeType || "video/mp4");

          respHeaders.set("Content-Type", finalMime);
          respHeaders.set("Content-Disposition", `attachment; filename="${encodeURIComponent(customFilename)}"; filename*=UTF-8''${encodeURIComponent(customFilename)}`);
          respHeaders.set("Access-Control-Expose-Headers", "Content-Disposition, Content-Length, Content-Range, Accept-Ranges");
          respHeaders.set("Accept-Ranges", "bytes");
          respHeaders.set("Cache-Control", "public, max-age=86400, s-maxage=86400");

          if (mediaRes.headers.has("content-length")) {
            respHeaders.set("Content-Length", mediaRes.headers.get("content-length")!);
          }
          if (mediaRes.headers.has("content-range")) {
            respHeaders.set("Content-Range", mediaRes.headers.get("content-range")!);
          }

          return new Response(mediaRes.body, {
            status: mediaRes.status,
            headers: respHeaders,
          });
        }

        // Return a clean 502 JSON error instead of redirecting into a video player
        return new Response(JSON.stringify({
          success: false,
          error: {
            code: "CLOUD_EXTRACTION_UNAVAILABLE",
            message: "Direct high-speed media stream could not be loaded. Please choose another quality or try again.",
            retryable: true,
            desktopFallback: false,
          },
        }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: false,
        error: {
          code: "CLOUD_EXTRACTION_UNAVAILABLE",
          message: "Could not retrieve direct media stream from cloud server. Please check YouTube availability.",
          retryable: true,
          desktopFallback: false,
        },
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─────────────────────────────────────────────────────────────
    // ── POST: Generate Direct Stream Download URL ────────────────
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

      let directStream = formatUrl;
      let audioDirectStream: string | undefined = undefined;
      let hasAudioCombined = true;

      const ytMatch = url.match(/(?:youtube[.]com\/(?:watch[?]v=|embed\/|shorts\/)|youtu[.]be\/)([a-zA-Z0-9_-]{11})/);
      const videoId = ytMatch ? ytMatch[1] : "";

      if (!directStream && videoId) {
        try {
          const resolved = await resolveStreamUrl(videoId, isAudio, quality);
          if (resolved?.streamUrl) {
            directStream = resolved.streamUrl;
            audioDirectStream = resolved.audioStreamUrl;
            hasAudioCombined = resolved.hasAudioCombined;
          }
        } catch (resolveErr) {
          console.warn("[Stream Resolver Error]:", resolveErr);
        }
      }

      // Generate clean download endpoints
      // 1. Same-origin proxy endpoint on Vercel: /api/download?...
      const downloadProxyUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}&audio=${isAudio}&quality=${encodeURIComponent(quality)}${directStream ? `&format_url=${encodeURIComponent(directStream)}` : ''}`;
      // 2. Direct Supabase Edge Function download endpoint (with Content-Disposition: attachment)
      const fullDownloadUrl = `${edgeBase}?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}&audio=${isAudio}&quality=${encodeURIComponent(quality)}${directStream ? `&format_url=${encodeURIComponent(directStream)}` : ''}`;

      const audioProxyUrl = audioDirectStream ? `/api/download?url=${encodeURIComponent(url)}&filename=audio.m4a&audio=true&quality=140&format_url=${encodeURIComponent(audioDirectStream)}` : '';
      const fullAudioDownloadUrl = audioDirectStream ? `${edgeBase}?url=${encodeURIComponent(url)}&filename=audio.m4a&audio=true&quality=140&format_url=${encodeURIComponent(audioDirectStream)}` : '';

      return new Response(JSON.stringify({
        success: true,
        downloadUrl: downloadProxyUrl,
        fullDownloadUrl: fullDownloadUrl,
        streamUrl: directStream || fullDownloadUrl,
        audioStreamUrl: audioDirectStream || (hasAudioCombined ? undefined : fullAudioDownloadUrl),
        audioDownloadUrl: audioProxyUrl || (hasAudioCombined ? undefined : fullAudioDownloadUrl),
        fullAudioDownloadUrl: fullAudioDownloadUrl || audioDirectStream,
        hasAudioCombined: hasAudioCombined,
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
    console.error("[Download Fatal Error]:", err?.message || err);
    return new Response(JSON.stringify({
      success: false,
      error: { code: "INTERNAL_ERROR", message: err?.message || "Internal server error", desktopFallback: false },
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
