// ============================================================
// SUPABASE EDGE FUNCTION: metadata
// Route: POST /functions/v1/metadata
//
// Gets YouTube & social video metadata using:
//  - Innertube (youtubei.js) with accurate multi-client format resolution
//  - YouTube oEmbed API fallback
//  - YouTube Data API v3 fallback (if YOUTUBE_API_KEY is set)
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
        console.error("[Metadata Shim Eval Error]:", evalErr);
        throw evalErr;
      }
    },
  });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Cookie Normalizer ─────────────────────────────────────────
function normalizeYouTubeCookies(rawCookie?: string | null): { cookieHeader: string; count: number; valid: boolean } {
  if (!rawCookie || typeof rawCookie !== "string" || !rawCookie.trim()) {
    return { cookieHeader: "", count: 0, valid: false };
  }
  const trimmed = rawCookie.trim();
  const cookiesMap = new Map<string, string>();

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item.name === "string" && typeof item.value === "string") {
            cookiesMap.set(item.name.trim(), item.value.trim());
          }
        }
      } else if (typeof parsed === "object" && parsed !== null) {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "string") cookiesMap.set(k.trim(), v.trim());
        }
      }
    } catch (_) {}
  }

  if (cookiesMap.size === 0 && (trimmed.includes("# Netscape") || trimmed.includes("\t") || trimmed.includes(".youtube.com"))) {
    const lines = trimmed.split(/\r?\n/);
    for (const line of lines) {
      const lineTrim = line.trim();
      if (!lineTrim || lineTrim.startsWith("#")) continue;
      const parts = lineTrim.split(/\t+|\s+/);
      if (parts.length >= 7) {
        const name = parts[5]?.trim();
        const value = parts[6]?.trim();
        if (name && value !== undefined) cookiesMap.set(name, value);
      }
    }
  }

  if (cookiesMap.size === 0) {
    const pairs = trimmed.split(";");
    for (const pair of pairs) {
      const idx = pair.indexOf("=");
      if (idx > 0) {
        const name = pair.substring(0, idx).trim();
        const value = pair.substring(idx + 1).trim();
        if (name && value) cookiesMap.set(name, value);
      }
    }
  }

  if (cookiesMap.size > 0) {
    const cookieHeader = Array.from(cookiesMap.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    return { cookieHeader, count: cookiesMap.size, valid: true };
  }
  return { cookieHeader: "", count: 0, valid: false };
}

// ── Safe Structured Diagnostic Logging ────────────────────────
export interface SafeDiagnostic {
  event: "youtube_metadata_success" | "youtube_metadata_failure";
  videoId?: string;
  stage: "initialization" | "metadata_fetch" | "oembed_fallback" | "data_api_fallback";
  httpStatus?: number;
  reason?: string;
  extractor: "youtubei.js";
  cookieConfigured: boolean;
  formatsFound?: number;
}

function logSafeDiagnostic(diag: SafeDiagnostic) {
  console.log(`[Metadata Diagnostic] ${JSON.stringify(diag)}`);
}

// ── Innertube Session ─────────────────────────────────────────
let cachedInnertube: any = null;
async function getInnertube() {
  if (!cachedInnertube) {
    const rawCookie = Deno.env.get("YOUTUBE_COOKIE");
    const normalized = normalizeYouTubeCookies(rawCookie);
    try {
      cachedInnertube = await Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true,
        ...(normalized.valid ? { cookie: normalized.cookieHeader } : {}),
      });
    } catch (err: any) {
      console.warn("[Metadata Innertube Warning]:", err.message);
      cachedInnertube = await Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true,
      });
    }
  }
  return cachedInnertube;
}

// ── Helpers ──────────────────────────────────────────────────
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

function extractPlatform(url: string): { type: "youtube" | "instagram" | "facebook" | "tiktok" | "direct" | "generic"; id?: string; channel?: string } {
  const ytMatch = url.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return { type: "youtube", id: ytMatch[1] };

  if (/(?:instagram\.com|instagr\.am)/i.test(url)) {
    const codeMatch = url.match(/\/(?:reel|reels|p|tv)\/([a-zA-Z0-9_-]+)/i);
    const shortcode = codeMatch ? codeMatch[1] : undefined;
    const userMatch = url.match(/(?:instagram\.com|instagr\.am)\/([a-zA-Z0-9_.]+)\/(?:reel|reels|p|tv)\//i);
    let username = userMatch ? userMatch[1] : undefined;
    if (username && ["share", "p", "reel", "reels", "tv"].includes(username.toLowerCase())) {
      username = undefined;
    }
    const channel = username ? `@${username}` : undefined;
    return { type: "instagram", id: shortcode, channel };
  }

  if (/(?:facebook\.com|fb\.watch)/i.test(url)) {
    const idMatch = url.match(/(?:watch\/?\?v=|reel\/|reels\/|videos\/|share\/r\/|share\/v\/|fb\.watch\/)([0-9a-zA-Z_-]+)/i);
    const videoId = idMatch ? idMatch[1] : undefined;
    const userMatch = url.match(/facebook\.com\/([a-zA-Z0-9_.]+)\/(?:videos|reel|reels)\//i);
    let username = userMatch ? userMatch[1] : undefined;
    if (username && ["watch", "share", "reel", "reels", "videos"].includes(username.toLowerCase())) {
      username = undefined;
    }
    const channel = username ? `@${username}` : undefined;
    return { type: "facebook", id: videoId, channel };
  }

  const ttMatch = url.match(/tiktok\.com\/(?:@[\w.-]+\/video\/|v\/|t\/)(\d+)/i);
  if (ttMatch) return { type: "tiktok", id: ttMatch[1] };

  if (url.match(/\.(mp4|webm|mkv|mov|mp3|m4a|ogg)($|\?)/i)) {
    return { type: "direct" };
  }

  return { type: "generic" };
}

function formatDurationSeconds(sec: number): string {
  if (!sec || isNaN(sec)) return "--:--";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
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

function decodeSnapApp(args: string[]): string {
  const [h, u, n, t, e, r] = args;
  const tNum = Number(t);
  const eNum = Number(e);
  function decode(d: string, eVal: number, fVal: number): string {
    const g = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/".split("");
    const hArr = g.slice(0, eVal);
    const iArr = g.slice(0, fVal);
    const j = d.split("").reverse().reduce((a, b, c) => {
      const idx = hArr.indexOf(b);
      if (idx !== -1) return a + idx * Math.pow(eVal, c);
      return a;
    }, 0);
    let k = "";
    let tempJ = j;
    while (tempJ > 0) {
      k = iArr[tempJ % fVal] + k;
      tempJ = Math.floor(tempJ / fVal);
    }
    return k || "0";
  }
  let result = "";
  for (let i = 0, len = h.length; i < len;) {
    let s = "";
    while (i < len && h[i] !== n[eNum]) {
      s += h[i];
      i++;
    }
    i++;
    for (let j = 0; j < n.length; j++) {
      s = s.replace(new RegExp(n[j], "g"), j.toString());
    }
    result += String.fromCharCode(Number(decode(s, eNum, 10)) - tNum);
  }
  try {
    const bytes = new Uint8Array(result.split("").map((c) => c.charCodeAt(0)));
    return new TextDecoder("utf-8").decode(bytes);
  } catch (_) {
    return result;
  }
}

function decryptSnapSave(data: string): string | null {
  try {
    if (!data.includes("decodeURIComponent(escape(r))}(")) return data;
    const part1 = data.split("decodeURIComponent(escape(r))}(")[1];
    if (!part1) return null;
    const part2 = part1.split("))")[0];
    if (!part2) return null;
    const rawArgs = part2.split(",").map((v) => v.replace(/"/g, "").trim());
    const decoded = decodeSnapApp(rawArgs);
    if (decoded.includes("getElementById(\"download-section\").innerHTML = \"")) {
      const section = decoded.split("getElementById(\"download-section\").innerHTML = \"")[1];
      const html = section.split("\"; document.getElementById(\"inputData\").remove(); ")[0] || section.split("\";")[0];
      return html.replace(/\\(\\)?/g, "");
    }
    return decoded;
  } catch (e) {
    console.warn("[SnapSave Decrypt Warning]:", e);
    return null;
  }
}

async function resolveViaSnapSave(url: string): Promise<{ directUrl: string; thumbnail?: string; formats: Array<{ quality: string; url: string }> } | null> {
  try {
    const res = await fetch("https://snapsave.app/action.php?lang=en", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "origin": "https://snapsave.app",
        "referer": "https://snapsave.app/",
      },
      body: "url=" + encodeURIComponent(url),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    const html = decryptSnapSave(text);
    if (!html) return null;

    let thumb = "";
    const thumbMatch = html.match(/<img[^>]+src=["\x27](https:\/\/[^"\x27]+)["\x27]/i);
    if (thumbMatch && !thumbMatch[1].includes("icon")) {
      thumb = thumbMatch[1];
    }

    const formats: Array<{ quality: string; url: string }> = [];
    const rowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*class=["\x27]video-quality["\x27][^>]*>([^<]+)<\/td>[\s\S]*?<a[^>]*href=["\x27]([^"\x27]+)["\x27]/gi;
    let match;
    while ((match = rowRegex.exec(html)) !== null) {
      const quality = match[1].trim();
      const href = match[2];
      if (href.startsWith("http") && !href.includes("play.google.com")) {
        formats.push({ quality, url: href });
      }
    }

    const btnRegex = /<div[^>]*class=["\x27]download-items__btn["\x27][^>]*>[\s\S]*?<a[^>]*href=["\x27]([^"\x27]+)["\x27]/gi;
    while ((match = btnRegex.exec(html)) !== null) {
      const href = match[1];
      if (href.startsWith("http") && !href.includes("play.google.com")) {
        formats.push({ quality: "Original HD", url: href });
      }
    }

    if (formats.length === 0) {
      const generalRegex = /href=["\x27](https:\/\/[^"\x27]*(?:rapidcdn|fbcdn|cdninstagram|snapsave)[^"\x27]*)["\x27]/gi;
      while ((match = generalRegex.exec(html)) !== null) {
        const href = match[1];
        if (!href.includes("play.google.com") && !formats.some((f) => f.url === href)) {
          formats.push({ quality: "HD", url: href });
        }
      }
    }

    if (formats.length === 0) return null;
    return {
      directUrl: formats[0].url,
      thumbnail: thumb,
      formats,
    };
  } catch (err: any) {
    console.warn("[SnapSave Resolver Warning]:", err?.message || err);
    return null;
  }
}

// ── Main Handler ─────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const url = body.url;
    const isDiagnostics = body.diagnostics === true;

    if (!url) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          code: "INVALID_URL",
          message: "url is required",
          retryable: false,
          desktopFallback: false,
          stage: "initialization",
        },
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const platform = extractPlatform(url);

    // ── 0A. Handle Instagram ─────────────────────────────────────
    if (platform.type === "instagram") {
      const shortcode = platform.id || "Reel";
      let channel = platform.channel || "Instagram Creator";
      let title = platform.channel 
        ? `Instagram Reel (${platform.channel} • ${shortcode})`
        : `Instagram Reel (${shortcode})`;
      let thumbnail = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80";

      let resolvedDirectUrl: string | undefined = undefined;
      let resolvedThumbnail: string | undefined = undefined;
      try {
        const snap = await resolveViaSnapSave(url);
        if (snap?.directUrl) {
          resolvedDirectUrl = snap.directUrl;
          if (snap.thumbnail) resolvedThumbnail = snap.thumbnail;
        }
      } catch (_) {}

      try {
        const oembedCtrl = new AbortController();
        const oembedTimeout = setTimeout(() => oembedCtrl.abort(), 1200);
        const oembedRes = await fetch(
          `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}`,
          { headers: { "User-Agent": "Mozilla/5.0" }, signal: oembedCtrl.signal }
        );
        clearTimeout(oembedTimeout);
        if (oembedRes.ok) {
          const d = await oembedRes.json();
          if (d.title) title = d.title;
          if (d.author_name) channel = `@${d.author_name}`;
          if (d.thumbnail_url) thumbnail = d.thumbnail_url;
        }
      } catch (_) {}

      if (resolvedThumbnail) thumbnail = resolvedThumbnail;

      const videoFormats = [
        { height: 1080, quality: "1080p HD (Original)", id: "1080p", sizeStr: "~15 MB", recommended: true, url: resolvedDirectUrl },
        { height: 720, quality: "720p HD", id: "720p", sizeStr: "~8 MB", recommended: false, url: resolvedDirectUrl },
        { height: 480, quality: "480p SD", id: "480p", sizeStr: "~4 MB", recommended: false, url: resolvedDirectUrl },
      ];
      const audioFormats = [
        { quality: "Original Audio (MP3)", id: "320K", sizeStr: "~2.5 MB", recommended: true, url: resolvedDirectUrl },
        { quality: "128 kbps (Standard)", id: "128K", sizeStr: "~1.2 MB", recommended: false, url: resolvedDirectUrl },
      ];

      return new Response(JSON.stringify({
        success: true,
        title,
        thumbnail,
        duration: "Reel",
        duration_string: "Reel",
        platform: "instagram",
        channel,
        url,
        restricted: false,
        authRequired: false,
        desktopFallback: false,
        videoFormats,
        audioFormats,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ── 0B. Handle Facebook ──────────────────────────────────────
    if (platform.type === "facebook") {
      const fbId = platform.id || "Video";
      let channel = platform.channel || "Facebook Creator";
      let title = platform.channel 
        ? `Facebook Video (${platform.channel} • ${fbId})`
        : `Facebook Video (${fbId})`;
      let thumbnail = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80";

      let resolvedDirectUrl: string | undefined = undefined;
      let resolvedThumbnail: string | undefined = undefined;
      try {
        const snap = await resolveViaSnapSave(url);
        if (snap?.directUrl) {
          resolvedDirectUrl = snap.directUrl;
          if (snap.thumbnail) resolvedThumbnail = snap.thumbnail;
        }
      } catch (_) {}

      try {
        const oembedCtrl = new AbortController();
        const oembedTimeout = setTimeout(() => oembedCtrl.abort(), 1200);
        const oembedRes = await fetch(
          `https://www.facebook.com/plugins/video/oembed.json/?url=${encodeURIComponent(url)}`,
          { headers: { "User-Agent": "Mozilla/5.0" }, signal: oembedCtrl.signal }
        );
        clearTimeout(oembedTimeout);
        if (oembedRes.ok) {
          const d = await oembedRes.json();
          if (d.title) title = d.title;
          if (d.author_name) channel = d.author_name;
          if (d.thumbnail_url) thumbnail = d.thumbnail_url;
        }
      } catch (_) {}

      if (resolvedThumbnail) thumbnail = resolvedThumbnail;

      const videoFormats = [
        { height: 1080, quality: "HD Quality (1080p)", id: "1080p", sizeStr: "~35 MB", recommended: true, url: resolvedDirectUrl },
        { height: 720, quality: "SD Quality (720p)", id: "720p", sizeStr: "~18 MB", recommended: false, url: resolvedDirectUrl },
        { height: 480, quality: "Standard (480p)", id: "480p", sizeStr: "~10 MB", recommended: false, url: resolvedDirectUrl },
      ];
      const audioFormats = [
        { quality: "Audio Only (MP3)", id: "320K", sizeStr: "~3.5 MB", recommended: true, url: resolvedDirectUrl },
        { quality: "128 kbps (Standard)", id: "128K", sizeStr: "~1.5 MB", recommended: false, url: resolvedDirectUrl },
      ];

      return new Response(JSON.stringify({
        success: true,
        title,
        thumbnail,
        duration: "Social Video",
        duration_string: "Social Video",
        platform: "facebook",
        channel,
        url,
        restricted: false,
        authRequired: false,
        desktopFallback: false,
        videoFormats,
        audioFormats,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ── 0C. Handle Direct Streams & Generic Links ────────────────
    if (platform.type === "direct" || platform.type === "generic") {
      try {
        const u = new URL(url);
        const name = u.pathname.split("/").pop() || "Media Stream";
        const cleanName = decodeURIComponent(name) || "Direct Video Stream";
        return new Response(JSON.stringify({
          success: true,
          title: cleanName,
          thumbnail: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80",
          duration: "--:--",
          platform: "direct",
          channel: u.hostname,
          url,
          restricted: false,
          authRequired: false,
          desktopFallback: false,
          videoFormats: [
            { height: 1080, quality: "Original Direct Stream", id: "1080p", sizeStr: "Stream", recommended: true }
          ],
          audioFormats: [
            { quality: "Original Audio (MP3)", id: "320K", sizeStr: "Stream", recommended: true }
          ]
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (_) {}
    }

    // ── 0D. YouTube Video ID Validation ──────────────────────────
    const videoId = platform.id;
    if (!videoId) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          code: "INVALID_URL",
          message: "Could not extract video details from the provided URL.",
          retryable: false,
          desktopFallback: false,
          stage: "initialization",
        },
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let title = "Unknown Title";
    let channelName = "";
    let duration = "--:--";
    let thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    let isRestricted = false;
    let authRequired = false;
    let availableHeights = new Set<number>();
    let totalFormatsCount = 0;
    let adaptiveFormatsCount = 0;
    let matchedClient = "ANDROID";

    // ── 0. Lightning Fast-Path: YouTube oEmbed (<150ms resolution) ──
    if (!isDiagnostics) {
      try {
        const oembedCtrl = new AbortController();
        const oembedTimeout = setTimeout(() => oembedCtrl.abort(), 1500);
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
          { headers: { "User-Agent": "Mozilla/5.0" }, signal: oembedCtrl.signal }
        );
        clearTimeout(oembedTimeout);
        if (oembedRes.ok) {
          const d = await oembedRes.json();
          if (d.title) {
            title = d.title;
            channelName = d.author_name ?? channelName;
            if (d.thumbnail_url) thumbnail = d.thumbnail_url;
            
            const standardQualities = [
              { height: 2160, quality: "4K (2160p)", id: "2160p", sizeStr: "~1.5 GB", recommended: false },
              { height: 1440, quality: "1440p", id: "1440p", sizeStr: "~700 MB", recommended: false },
              { height: 1080, quality: "1080p HD", id: "1080p", sizeStr: "~350 MB", recommended: true },
              { height: 720, quality: "720p HD", id: "720p", sizeStr: "~180 MB", recommended: false },
              { height: 480, quality: "480p", id: "480p", sizeStr: "~80 MB", recommended: false },
              { height: 360, quality: "360p", id: "360p", sizeStr: "~50 MB", recommended: false },
            ];
            const audioFormats = [
              { quality: "320 kbps (Ultra HQ)", id: "320K", sizeStr: "~2.4 MB/min", recommended: true },
              { quality: "256 kbps (High Quality)", id: "256K", sizeStr: "~1.9 MB/min", recommended: false },
              { quality: "192 kbps (Standard)", id: "192K", sizeStr: "~1.4 MB/min", recommended: false },
              { quality: "128 kbps (Economy)", id: "128K", sizeStr: "~0.9 MB/min", recommended: false },
            ];

            return new Response(JSON.stringify({
              success: true,
              title,
              thumbnail,
              duration,
              platform: "youtube",
              channel: channelName,
              videoId,
              url,
              restricted: false,
              authRequired: false,
              desktopFallback: false,
              videoFormats: standardQualities,
              audioFormats,
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
        }
      } catch (_) {
        // Fallback to Innertube if oEmbed timed out or video is restricted
      }
    }

    // 1. Try Innertube across multi-client strategy (ANDROID -> IOS -> TV -> MWEB -> WEB)
    const yt = await getInnertube();
    let videoInfo: any = null;

    for (const client of ["ANDROID", "IOS", "TV", "MWEB", "WEB"] as const) {
      try {
        const candidate = await yt.getBasicInfo(videoId, { client });
        if (candidate?.basic_info?.title) {
          videoInfo = candidate;
          matchedClient = client;
          if (candidate?.streaming_data?.formats?.length || candidate?.streaming_data?.adaptive_formats?.length) {
            break;
          }
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        const lower = msg.toLowerCase();
        if (
          lower.includes("login required") ||
          lower.includes("login_required") ||
          lower.includes("sign in with a google account") ||
          lower.includes("requires authentication")
        ) {
          authRequired = true;
          isRestricted = true;
        } else if (
          lower.includes("confirm your age") ||
          lower.includes("age-restricted") ||
          lower.includes("age_verification_required")
        ) {
          isRestricted = true;
        }
      }
    }

    if (videoInfo && videoInfo.basic_info) {
      title = videoInfo.basic_info.title || title;
      channelName = videoInfo.basic_info.author || channelName;
      if (videoInfo.basic_info.duration) {
        duration = formatDurationSeconds(videoInfo.basic_info.duration);
      }
      if (videoInfo.basic_info.thumbnail && videoInfo.basic_info.thumbnail.length > 0) {
        const lastThumb = videoInfo.basic_info.thumbnail[videoInfo.basic_info.thumbnail.length - 1];
        if (lastThumb?.url) thumbnail = lastThumb.url;
      }

      // Check formats
      const progFormats = videoInfo.streaming_data?.formats || [];
      const adaptFormats = videoInfo.streaming_data?.adaptive_formats || [];
      const allFormats = [...progFormats, ...adaptFormats];
      totalFormatsCount = allFormats.length;
      adaptiveFormatsCount = adaptFormats.length;

      for (const f of allFormats) {
        if (f.height) availableHeights.add(f.height);
      }

      logSafeDiagnostic({
        event: "youtube_metadata_success",
        videoId,
        stage: "metadata_fetch",
        extractor: "youtubei.js",
        cookieConfigured: !!Deno.env.get("YOUTUBE_COOKIE"),
        formatsFound: allFormats.length,
      });
    }

    // Diagnostic Request Return
    if (isDiagnostics) {
      const rawCookie = Deno.env.get("YOUTUBE_COOKIE");
      const normalized = normalizeYouTubeCookies(rawCookie);
      return new Response(JSON.stringify({
        videoId,
        extractor: "youtubei.js",
        client: matchedClient,
        cookieConfigured: !!rawCookie,
        cookieCount: normalized.count,
        playabilityStatus: videoInfo?.playability_status?.status || (authRequired ? "LOGIN_REQUIRED" : "OK"),
        playabilityReason: videoInfo?.playability_status?.reason || "",
        hasStreamingData: !!videoInfo?.streaming_data,
        formatCount: totalFormatsCount,
        adaptiveFormatCount: adaptiveFormatsCount,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Fallback: YouTube oEmbed
    if (title === "Unknown Title") {
      try {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
          { headers: { "User-Agent": "StreamVault/1.0" } }
        );
        if (oembedRes.ok) {
          const d = await oembedRes.json();
          title = d.title ?? title;
          channelName = d.author_name ?? channelName;
        }
      } catch (_) {}
    }

    // 3. Fallback: YouTube Data API v3
    const YT_KEY = Deno.env.get("YOUTUBE_API_KEY");
    if (YT_KEY && duration === "--:--") {
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
            thumbnail = thumbs?.maxres?.url ?? thumbs?.high?.url ?? thumbs?.medium?.url ?? thumbnail;
            duration = parseIsoDuration(item.contentDetails?.duration ?? "");
          }
        }
      } catch (_) {}
    }

    // If all providers failed to resolve metadata (e.g. invalid ID or deleted video)
    if (title === "Unknown Title" && availableHeights.size === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: {
          code: "YOUTUBE_UNAVAILABLE",
          message: "This video is unavailable or has been removed from YouTube.",
          retryable: false,
          desktopFallback: false,
          stage: "metadata_fetch",
        },
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Construct format list matching actual video capabilities
    const standardQualities = [
      { height: 2160, quality: "4K (2160p)", id: "2160p", sizeStr: "~1.5 GB", recommended: false },
      { height: 1440, quality: "1440p", id: "1440p", sizeStr: "~700 MB", recommended: false },
      { height: 1080, quality: "1080p HD", id: "1080p", sizeStr: "~350 MB", recommended: true },
      { height: 720, quality: "720p HD", id: "720p", sizeStr: "~180 MB", recommended: false },
      { height: 480, quality: "480p", id: "480p", sizeStr: "~80 MB", recommended: false },
      { height: 360, quality: "360p", id: "360p", sizeStr: "~50 MB", recommended: false },
    ];

    let videoFormats = standardQualities;
    if (availableHeights.size > 0) {
      videoFormats = standardQualities.filter(q => availableHeights.has(q.height) || q.height <= Math.max(...Array.from(availableHeights)));
      if (videoFormats.length === 0) videoFormats = standardQualities;
    }

    const audioFormats = [
      { quality: "320 kbps (Ultra HQ)", id: "320K", sizeStr: "~2.4 MB/min", recommended: true },
      { quality: "256 kbps (High Quality)", id: "256K", sizeStr: "~1.9 MB/min", recommended: false },
      { quality: "192 kbps (Standard)", id: "192K", sizeStr: "~1.4 MB/min", recommended: false },
      { quality: "128 kbps (Economy)", id: "128K", sizeStr: "~0.9 MB/min", recommended: false },
    ];

    const payload = {
      success: true,
      title,
      thumbnail,
      duration,
      platform: "youtube",
      channel: channelName,
      videoId,
      url,
      restricted: isRestricted,
      authRequired,
      desktopFallback: isRestricted || authRequired,
      videoFormats,
      audioFormats,
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({
      success: false,
      error: {
        code: "METADATA_EXTRACTION_FAILED",
        message: message,
        retryable: true,
        desktopFallback: true,
        stage: "metadata_fetch",
      },
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
