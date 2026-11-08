// ============================================================
// SUPABASE EDGE FUNCTION: download
// Route: /functions/v1/download
//
// Cleanly Separated Multi-Platform Cloud Downloader & Stream Proxy:
//  - SECTION 1: YouTube Downloader Engine (Innertube iOS/MWeb/Android/Web,
//               adaptive 1080p/720p/MP3 stream resolution, range streaming)
//  - SECTION 2: Social Media Downloader Engine (Instagram Reels & Facebook
//               Videos via SnapSave pure-JS decryptor & Meta CDN proxy)
//  - SECTION 3: HTTP Router & Dispatcher (routes requests to the
//               respective engine so changes to one never affect the other)
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Allow-Methods": "POST, GET, HEAD, OPTIONS",
};

const PROJECT_REF = "sjnamkshicpxtyikzsnp";
const EDGE_BASE = `https://${PROJECT_REF}.supabase.co/functions/v1/download`;

export interface ResolvedStreamResult {
  streamUrl: string;
  audioStreamUrl?: string;
  directCdnUrl?: string;
  audioDirectCdnUrl?: string;
  mimeType: string;
  itag?: string;
  hasAudioCombined: boolean;
}

// ============================================================
// SECTION 1: YOUTUBE DOWNLOAD ENGINE (Completely Isolated)
// ============================================================

// ── Default YouTube Session Cookies ──────────────────────────
const DEFAULT_YOUTUBE_COOKIE = "";

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

let cachedYouTubeSession: any = null;
async function getYouTubeInnertube() {
  if (!cachedYouTubeSession) {
    const rawCookie = Deno.env.get("YOUTUBE_COOKIE") || DEFAULT_YOUTUBE_COOKIE;
    const normalized = rawCookie ? normalizeYouTubeCookies(rawCookie) : { valid: false, cookieHeader: "" };
    try {
      cachedYouTubeSession = await Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true,
        ...(normalized.valid ? { cookie: normalized.cookieHeader } : {}),
      });
    } catch (_) {
      cachedYouTubeSession = await Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true,
      });
    }
  }
  return cachedYouTubeSession;
}

function parseQualityHeight(q: string): number {
  const s = (q || "").toLowerCase();
  if (s.includes("8k") || s.includes("4320")) return 4320;
  if (s.includes("4k") || s.includes("2160")) return 2160;
  if (s.includes("1440") || s.includes("2k")) return 1440;
  if (s.includes("1080")) return 1080;
  if (s.includes("720")) return 720;
  if (s.includes("480")) return 480;
  if (s.includes("360")) return 360;
  return parseInt(s.replace(/[^0-9]/g, "") || "1080");
}

// ── Provider 1: Cobalt v10 High-Speed Pre-Muxed Engine ────────
const COBALT_INSTANCES: string[] = [
  "https://cobalt-api.kwiatekm.pl",
  "https://api.cobalt.tools",
  "https://cobalt.api.scip.io",
  "https://cobalt.kwiatekm.pl",
  "https://cobalt.synapticfire.net",
  "https://cobalt.canine.tools",
  "https://cobalt.ducks.party",
];

async function resolveYouTubeViaCobalt(url: string, isAudio: boolean, quality: string): Promise<ResolvedStreamResult | null> {
  const targetH = parseQualityHeight(quality);
  const qStr = targetH >= 1080 ? "1080" : targetH >= 720 ? "720" : targetH >= 480 ? "480" : "360";

  const promises = COBALT_INSTANCES.map(async (inst) => {
    const resp = await fetch(`${inst}/`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        videoQuality: qStr,
        downloadMode: isAudio ? "audio" : "auto",
        audioFormat: "mp3",
      }),
      signal: AbortSignal.timeout(3500),
    });

    if (!resp.ok) throw new Error(`${inst} status ${resp.status}`);
    const data = await resp.json();
    if ((data.status === "tunnel" || data.status === "redirect" || data.status === "stream") && data.url) {
      console.log(`[YouTube Engine] Cobalt succeeded via ${inst}`);
      return {
        streamUrl: data.url,
        mimeType: isAudio ? "audio/mpeg" : "video/mp4",
        hasAudioCombined: true,
      };
    }
    throw new Error(`Invalid cobalt response from ${inst}`);
  });

  try {
    return await Promise.any(promises);
  } catch (_) {
    return null;
  }
}

// ── Provider 1: BTCH High-Speed Residential Proxy Engine ───────
async function resolveYouTubeViaBtch(videoId: string, isAudio: boolean): Promise<ResolvedStreamResult | null> {
  const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const endpoints = [
    `https://backend1.tioo.eu.org/api/downloader/youtube?url=${encodeURIComponent(targetUrl)}`,
    `https://backend1.tioo.eu.org/youtube?url=${encodeURIComponent(targetUrl)}`,
  ];

  const promises = endpoints.map(async (ep) => {
    const apiRes = await fetch(ep, {
      signal: AbortSignal.timeout(12000),
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "btch/6.3.6",
        "X-Client-Version": "6.3.6",
      },
    });
    if (!apiRes.ok) throw new Error(`${ep} status ${apiRes.status}`);
    const data = await apiRes.json();
    if (!data || data.status === false) throw new Error(`${ep} status false`);
    const mediaUrl = isAudio ? (data.mp3 || data.audio) : (data.mp4 || data.url);
    if (!mediaUrl) throw new Error(`${ep} no media url`);

    console.log(`[YouTube Engine] BTCH API succeeded via ${ep}`);
    return {
      streamUrl: mediaUrl,
      directCdnUrl: mediaUrl,
      mimeType: isAudio ? "audio/mp4" : "video/mp4",
      hasAudioCombined: true,
    };
  });

  try {
    return await Promise.any(promises);
  } catch (err: any) {
    console.warn("[YouTube Engine] BTCH API pool warning:", err?.message || err);
    return null;
  }
}

// ── Provider 3: Piped API Engine Pool ─────────────────────────
const PIPED_INSTANCES: string[] = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.private.coffee",
  "https://api.piped.yt",
  "https://pipedapi.ducks.party",
];

async function resolveYouTubeViaPiped(videoId: string, isAudio: boolean, quality: string): Promise<ResolvedStreamResult | null> {
  const targetH = parseQualityHeight(quality);

  const promises = PIPED_INSTANCES.map(async (piped) => {
    const res = await fetch(`${piped}/streams/${videoId}`, {
      headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) throw new Error(`Piped ${piped} status ${res.status}`);
    const data = await res.json();
    if (!data) throw new Error("Empty data");

    if (isAudio) {
      const audioStreams = data.audioStreams || [];
      if (audioStreams.length === 0) throw new Error("No audio streams");
      audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      const chosen = audioStreams.find((s: any) => s.mimeType?.includes("mp4") || s.mimeType?.includes("m4a")) || audioStreams[0];
      if (!chosen?.url) throw new Error("No audio url");
      return {
        streamUrl: chosen.url,
        mimeType: chosen.mimeType?.split(";")[0] || "audio/mp4",
        hasAudioCombined: true,
      };
    } else {
      const videoStreams = data.videoStreams || [];
      if (videoStreams.length === 0) throw new Error("No video streams");

      // Progressive format check (combined video + audio <= 720p)
      if (targetH <= 720) {
        const prog = videoStreams.filter((s: any) => !s.videoOnly && s.url);
        const exactProg = prog.find((s: any) => {
          const h = parseInt(String(s.quality || "").replace(/[^0-9]/g, "") || "0");
          return h === targetH;
        });
        if (exactProg) {
          return {
            streamUrl: exactProg.url,
            mimeType: exactProg.mimeType?.split(";")[0] || "video/mp4",
            hasAudioCombined: true,
          };
        }
      }

      // Adaptive video stream
      const vStreams = videoStreams.filter((s: any) => s.url);
      vStreams.sort((a: any, b: any) => {
        const ha = parseInt(String(a.quality || "").replace(/[^0-9]/g, "") || "0");
        const hb = parseInt(String(b.quality || "").replace(/[^0-9]/g, "") || "0");
        return hb - ha;
      });

      const chosenVideo = vStreams.find((s: any) => {
        const h = parseInt(String(s.quality || "").replace(/[^0-9]/g, "") || "0");
        return h === targetH;
      }) || vStreams[0];

      const audioStreams = (data.audioStreams || []).filter((s: any) => s.url);
      audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      const chosenAudio = audioStreams.find((s: any) => s.mimeType?.includes("mp4") || s.mimeType?.includes("m4a")) || audioStreams[0];

      return {
        streamUrl: chosenVideo.url,
        audioStreamUrl: chosenAudio?.url,
        mimeType: chosenVideo.mimeType?.split(";")[0] || "video/mp4",
        hasAudioCombined: !chosenAudio || chosenVideo.videoOnly === false,
      };
    }
  });

  try {
    return await Promise.any(promises);
  } catch (_) {
    return null;
  }
}

// ── Provider 4: Invidious Mirrors with Range Probe Verification ──
const INVIDIOUS_MIRRORS: string[] = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://invidious.tiekoetter.com",
  "https://invidious.privacydev.net",
  "https://vid.priv.au",
  "https://yt.artemislena.eu",
  "https://invidious.flokinet.to",
];

async function resolveYouTubeViaInvidious(videoId: string, isAudio: boolean, quality: string): Promise<ResolvedStreamResult | null> {
  const targetH = parseQualityHeight(quality);

  const mirrorPromises = INVIDIOUS_MIRRORS.map(async (mirror) => {
    const res = await fetch(`${mirror}/api/v1/videos/${videoId}`, {
      signal: AbortSignal.timeout(3500),
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) throw new Error(`Mirror ${mirror} status ${res.status}`);
    const data = await res.json();
    if (!data) throw new Error(`Mirror ${mirror} empty data`);

    const adaptive = data.adaptiveFormats || [];
    const prog = data.formatStreams || [];

    if (isAudio) {
      const audioFormats = adaptive.filter((f: any) => f.type && f.type.includes("audio") && (f.url || f.itag));
      if (audioFormats.length > 0) {
        audioFormats.sort((a: any, b: any) => (parseInt(b.bitrate || "0") - parseInt(a.bitrate || "0")));
        const chosen = audioFormats.find((f: any) => String(f.itag) === "140" || (f.type && f.type.includes("mp4"))) || audioFormats[0];
        const aItag = String(chosen.itag || "140");
        const candidateUrl = `${mirror}/latest_version?id=${videoId}&itag=${aItag}&local=true`;

        // Probe verify candidate before returning
        const probe = await fetch(candidateUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Range": "bytes=0-10",
            "Referer": `${mirror}/`,
          },
          signal: AbortSignal.timeout(2500),
          redirect: "follow",
        });
        if (!probe.ok && probe.status !== 206) throw new Error(`Mirror ${mirror} audio probe failed ${probe.status}`);

        return {
          streamUrl: candidateUrl,
          directCdnUrl: chosen.url,
          mimeType: chosen.type?.split(";")[0] || "audio/mp4",
          itag: aItag,
          hasAudioCombined: true,
        };
      }
    } else {
      if (prog && prog.length > 0 && targetH <= 720) {
        const exactProg = prog.find((f: any) => {
          const resNum = parseInt((f.resolution || "").replace(/[^0-9]/g, "") || "0");
          return resNum === targetH;
        });
        if (exactProg && (exactProg.url || exactProg.itag)) {
          const candidateUrl = `${mirror}/latest_version?id=${videoId}&itag=${exactProg.itag}&local=true`;
          const probe = await fetch(candidateUrl, {
            method: "GET",
            headers: { "User-Agent": "Mozilla/5.0", "Range": "bytes=0-10", "Referer": `${mirror}/` },
            signal: AbortSignal.timeout(2500),
            redirect: "follow",
          });
          if (!probe.ok && probe.status !== 206) throw new Error(`Mirror ${mirror} prog probe failed ${probe.status}`);

          return {
            streamUrl: candidateUrl,
            directCdnUrl: exactProg.url,
            mimeType: exactProg.type?.split(";")[0] || "video/mp4",
            itag: String(exactProg.itag),
            hasAudioCombined: true,
          };
        }
      }

      const videoAdaptive = adaptive.filter((f: any) => f.type && f.type.includes("video") && (f.url || f.itag));
      const audioAdaptive = adaptive.filter((f: any) => f.type && f.type.includes("audio") && (f.url || f.itag));
      audioAdaptive.sort((a: any, b: any) => (parseInt(b.bitrate || "0") - parseInt(a.bitrate || "0")));
      const chosenAudio = audioAdaptive.find((f: any) => String(f.itag) === "140" || (f.type && f.type.includes("mp4"))) || audioAdaptive[0];

      if (videoAdaptive.length > 0) {
        const mp4Videos = videoAdaptive.filter((f: any) => f.type && f.type.includes("mp4"));
        const candidates = mp4Videos.length > 0 ? mp4Videos : videoAdaptive;
        const exactMatch = candidates.find((f: any) => {
          const resNum = parseInt((f.resolution || f.qualityLabel || "").replace(/[^0-9]/g, "") || "0");
          return resNum === targetH;
        });
        const chosenVideo = exactMatch || candidates[0];
        const vItag = String(chosenVideo.itag || (targetH >= 1080 ? "137" : (targetH >= 720 ? "136" : "135")));
        const aItag = String(chosenAudio?.itag || "140");

        const candidateUrl = `${mirror}/latest_version?id=${videoId}&itag=${vItag}&local=true`;
        const probe = await fetch(candidateUrl, {
          method: "GET",
          headers: { "User-Agent": "Mozilla/5.0", "Range": "bytes=0-10", "Referer": `${mirror}/` },
          signal: AbortSignal.timeout(2500),
          redirect: "follow",
        });
        if (!probe.ok && probe.status !== 206) throw new Error(`Mirror ${mirror} video probe failed ${probe.status}`);

        return {
          streamUrl: candidateUrl,
          audioStreamUrl: `${mirror}/latest_version?id=${videoId}&itag=${aItag}&local=true`,
          directCdnUrl: chosenVideo.url,
          audioDirectCdnUrl: chosenAudio?.url,
          mimeType: chosenVideo.type?.split(";")[0] || "video/mp4",
          itag: vItag,
          hasAudioCombined: false,
        };
      }
    }
    throw new Error(`No matching formats on ${mirror}`);
  });

  try {
    const mirrorResult = await Promise.any(mirrorPromises);
    if (mirrorResult?.streamUrl) {
      console.log(`[YouTube Engine] Invidious verified mirror race succeeded`);
      return mirrorResult;
    }
  } catch (_) { }

  return null;
}

// Auxiliary YouTube stream resolver using Innertube with mobile client priority
async function resolveYouTubeViaInnertube(videoId: string, isAudio: boolean, quality: string): Promise<ResolvedStreamResult | null> {
  const yt = await getYouTubeInnertube();
  let video: any = null;
  const clientErrors: Record<string, string> = {};

  // Try TV, TV_EMBEDDED, IOS and ANDROID with 3.5s timeout each
  for (const client of ["TV", "TV_EMBEDDED", "IOS", "ANDROID"] as const) {
    try {
      const candidatePromise = yt.getBasicInfo(videoId, { client });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3500));
      const candidate: any = await Promise.race([candidatePromise, timeoutPromise]);
      if (candidate?.streaming_data?.formats?.length || candidate?.streaming_data?.adaptive_formats?.length) {
        video = candidate;
        console.log(`[YouTube Engine] Successfully resolved formats via client: ${client}`);
        break;
      } else {
        clientErrors[client] = `status: ${candidate?.playability_status?.status}`;
      }
    } catch (err: any) {
      clientErrors[client] = err?.message || String(err);
    }
  }

  const streamingData = video?.streaming_data;
  if (!streamingData) {
    throw new Error(`No streaming data available from Innertube. Client attempts: ${JSON.stringify(clientErrors)}`);
  }

  const formats = streamingData.formats || [];
  const adaptive = streamingData.adaptive_formats || [];
  let chosenFmt = null;
  let chosenAudioFmt: any = null;
  let hasAudioCombined = false;

  if (isAudio) {
    const audioFormats = adaptive.filter((f: any) => f.has_audio);
    audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
    chosenFmt = audioFormats.find((f: any) => f.itag === 140) || audioFormats[0] || formats.find((f: any) => f.has_audio);
    hasAudioCombined = true;
  } else {
    const targetH = parseQualityHeight(quality);

    // Progressive format check for <= 720p (combined video + audio)
    const prog = formats.filter((f: any) => f.has_video && f.has_audio);
    if (prog.length > 0 && targetH <= 720) {
      prog.sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
      const exactProg = prog.find((f: any) => f.height === targetH);
      if (exactProg) {
        chosenFmt = exactProg;
        hasAudioCombined = true;
        console.log(`[YouTube Engine] Progressive Video+Audio Format: ${chosenFmt.quality_label || chosenFmt.height + 'p'} (itag: ${chosenFmt.itag})`);
      }
    }

    if (!chosenFmt) {
      // Modern adaptive video format (1080p, 720p, etc.)
      const vAdaptive = adaptive.filter((f: any) => f.has_video);
      vAdaptive.sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
      chosenFmt = vAdaptive.find((f: any) => f.height === targetH) ||
                  vAdaptive.find((f: any) => (f.quality_label || "").includes(String(targetH))) ||
                  vAdaptive.find((f: any) => (f.height || 0) <= targetH) ||
                  vAdaptive[0];

      // High-quality audio format (prefer itag 140 or itag 139)
      const aAdaptive = adaptive.filter((f: any) => f.has_audio);
      aAdaptive.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      chosenAudioFmt = aAdaptive.find((f: any) => f.itag === 140) || aAdaptive.find((f: any) => f.mime_type?.includes("mp4") || f.mime_type?.includes("m4a")) || aAdaptive[0];
      hasAudioCombined = false;
      console.log(`[YouTube Engine] Adaptive Video (${chosenFmt?.quality_label || chosenFmt?.height + 'p'}, itag ${chosenFmt?.itag}) + Audio (itag ${chosenAudioFmt?.itag})`);
    }
  }

  if (!chosenFmt) throw new Error("No candidate YouTube format found");

  let streamUrl = chosenFmt.url;
  if (!streamUrl && typeof chosenFmt.decipher === "function") {
    try {
      streamUrl = await chosenFmt.decipher(yt.session.player);
    } catch (dErr) {
      console.warn("[YouTube Decipher Error]:", dErr);
    }
  }
  if (!streamUrl) throw new Error("Could not extract YouTube stream URL");

  let audioStreamUrl: string | undefined = undefined;
  if (chosenAudioFmt) {
    audioStreamUrl = chosenAudioFmt.url;
    if (!audioStreamUrl && typeof chosenAudioFmt.decipher === "function") {
      try {
        audioStreamUrl = await chosenAudioFmt.decipher(yt.session.player);
      } catch (adErr) {
        console.warn("[YouTube Audio Decipher Error]:", adErr);
      }
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

async function resolveYouTubeStream(videoId: string, isAudio: boolean, quality: string): Promise<ResolvedStreamResult | null> {
  const fullYtUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // 1. First Priority: BTCH Residential Proxy Engine (Fastest, pre-muxed combined MP4 with audio, CORS open)
  try {
    const btchRes = await resolveYouTubeViaBtch(videoId, isAudio);
    if (btchRes?.streamUrl) {
      console.log(`[YouTube Engine] Resolved via BTCH: hasAudioCombined=${btchRes.hasAudioCombined}`);
      return btchRes;
    }
  } catch (err: any) {
    console.warn(`[YouTube Engine] BTCH API error for ${videoId}:`, err?.message || err);
  }

  // 2. Second Priority: Verified Invidious mirrors (with live HTTP 200/206 probe verification)
  try {
    const invRes = await resolveYouTubeViaInvidious(videoId, isAudio, quality);
    if (invRes?.streamUrl) {
      console.log(`[YouTube Engine] Resolved via Invidious (probe passed): hasAudioCombined=${invRes.hasAudioCombined}`);
      return invRes;
    }
  } catch (invErr: any) {
    console.warn(`[YouTube Engine] Invidious error for ${videoId}:`, invErr?.message || invErr);
  }

  // 3. Third Priority: Piped API pool (Verified streaming instances)
  try {
    const pipedRes = await resolveYouTubeViaPiped(videoId, isAudio, quality);
    if (pipedRes?.streamUrl) {
      console.log(`[YouTube Engine] Resolved via Piped: hasAudioCombined=${pipedRes.hasAudioCombined}`);
      return pipedRes;
    }
  } catch (err: any) {
    console.warn(`[YouTube Engine] Piped pool error for ${videoId}:`, err?.message || err);
  }

  // 4. Fourth Priority: Innertube TV & Mobile fallback
  try {
    const res = await resolveYouTubeViaInnertube(videoId, isAudio, quality);
    if (res?.streamUrl) {
      console.log(`[YouTube Engine] Resolved via Innertube: hasAudioCombined=${res.hasAudioCombined}`);
      return res;
    }
  } catch (err: any) {
    console.warn(`[YouTube Engine] Innertube error for ${videoId}:`, err?.message || err);
  }

  // 5. Fifth Priority: Cobalt v10 engine
  try {
    const cobaltRes = await resolveYouTubeViaCobalt(fullYtUrl, isAudio, quality);
    if (cobaltRes?.streamUrl) {
      console.log(`[YouTube Engine] Resolved via Cobalt: hasAudioCombined=${cobaltRes.hasAudioCombined}`);
      return cobaltRes;
    }
  } catch (err: any) {
    console.warn(`[YouTube Engine] Cobalt pool error for ${videoId}:`, err?.message || err);
  }

  return null;
}

// Handler for YouTube POST requests
async function handleYouTubePost(body: any, reqUrl: URL): Promise<Response> {
  const url = body.url || "";
  const quality = body.quality || "1080p";
  const format = body.format || "video";
  const isAudio = format === "audio" || format === "mp3";
  let filename = body.filename || `StreamVault_${Date.now()}.${isAudio ? "mp3" : "mp4"}`;

  if (!filename.toLowerCase().endsWith(".mp3") && !filename.toLowerCase().endsWith(".mp4")) {
    filename += isAudio ? ".mp3" : ".mp4";
  }

  const ytMatch = url.match(/(?:youtube[.]com\/(?:watch[?]v=|embed\/|shorts\/)|youtu[.]be\/)([a-zA-Z0-9_-]{11})/);
  const videoId = ytMatch ? ytMatch[1] : "";

  if (!videoId) {
    return new Response(JSON.stringify({
      success: false,
      error: { code: "INVALID_YOUTUBE_URL", message: "Invalid YouTube URL format", desktopFallback: false }
    }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const targetH = parseQualityHeight(quality);

  // Only resolutions strictly ABOVE 1080p (e.g. 1440p / 2K, 4K, 8K) require Desktop Pro
  if (!isAudio && targetH > 1080) {
    return new Response(JSON.stringify({
      success: false,
      error: {
        code: "DESKTOP_PRO_REQUIRED",
        message: "Resolutions above 1080p (1440p, 4K, 8K) require StreamVault Desktop Pro. Online web downloads support up to 1080p Full HD.",
        desktopFallback: true,
        platform: "youtube",
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const resolved = await resolveYouTubeStream(videoId, isAudio, quality);

  // If stream resolution failed, do NOT lock user out with Desktop Pro. Provide clean retryable error.
  if (!resolved || !resolved.streamUrl) {
    return new Response(JSON.stringify({
      success: false,
      error: {
        code: "YOUTUBE_STREAM_RETRY",
        message: "YouTube media stream temporarily busy. Please retry or choose another quality.",
        desktopFallback: false,
        platform: "youtube",
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const directStream = resolved.streamUrl;
  const audioDirectStream = resolved.audioStreamUrl;
  const hasAudioCombined = resolved.hasAudioCombined;

  // Cloud streaming proxy endpoints
  const downloadProxyUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}&audio=${isAudio}&quality=${encodeURIComponent(quality)}&format_url=${encodeURIComponent(directStream)}`;
  const fullDownloadUrl = `${EDGE_BASE}?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}&audio=${isAudio}&quality=${encodeURIComponent(quality)}&format_url=${encodeURIComponent(directStream)}`;

  const audioProxyUrl = audioDirectStream ? `/api/download?url=${encodeURIComponent(url)}&filename=audio.m4a&audio=true&quality=140&format_url=${encodeURIComponent(audioDirectStream)}` : '';
  const fullAudioDownloadUrl = audioDirectStream ? `${EDGE_BASE}?url=${encodeURIComponent(url)}&filename=audio.m4a&audio=true&quality=140&format_url=${encodeURIComponent(audioDirectStream)}` : '';

  return new Response(JSON.stringify({
    success: true,
    platform: "youtube",
    downloadUrl: downloadProxyUrl,
    fullDownloadUrl: fullDownloadUrl,
    streamUrl: directStream,
    directCdnUrl: resolved.directCdnUrl,
    audioStreamUrl: audioDirectStream,
    audioDirectCdnUrl: resolved.audioDirectCdnUrl,
    audioDownloadUrl: audioProxyUrl || undefined,
    fullAudioDownloadUrl: fullAudioDownloadUrl || undefined,
    hasAudioCombined: hasAudioCombined,
    filename: filename,
    quality: quality,
    format: isAudio ? "mp3" : "mp4",
    via: "youtube-cloud-stream",
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Handler for YouTube GET / HEAD stream proxying
async function handleYouTubeGet(req: Request, reqUrl: URL): Promise<Response> {
  const videoUrl = reqUrl.searchParams.get("url") || "";
  let streamUrl = reqUrl.searchParams.get("format_url");
  const formatParam = reqUrl.searchParams.get("format") || "";
  const isAudio = reqUrl.searchParams.get("audio") === "true" || formatParam === "mp3" || formatParam === "audio";
  const quality = reqUrl.searchParams.get("quality") || "1080p";
  let customFilename = reqUrl.searchParams.get("filename") || (isAudio ? "audio.mp3" : "video.mp4");

  if (!customFilename.toLowerCase().endsWith(".mp3") && !customFilename.toLowerCase().endsWith(".mp4") && !customFilename.toLowerCase().endsWith(".m4a")) {
    customFilename += isAudio ? ".mp3" : ".mp4";
  }

  const ytMatch = videoUrl.match(/(?:youtube[.]com\/(?:watch[?]v=|embed\/|shorts\/)|youtu[.]be\/)([a-zA-Z0-9_-]{11})/);
  const videoId = ytMatch ? ytMatch[1] : "";

  if (!streamUrl && videoId) {
    const resolved = await resolveYouTubeStream(videoId, isAudio, quality);
    streamUrl = resolved?.streamUrl;
  }

  if (!streamUrl) {
    return new Response(JSON.stringify({
      success: false,
      error: {
        code: "YOUTUBE_STREAM_RETRY",
        message: "YouTube media stream temporarily busy. Please choose another quality or try again.",
        retryable: true,
        desktopFallback: false,
        platform: "youtube",
      },
    }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let mimeType = isAudio ? (customFilename.endsWith(".m4a") ? "audio/mp4" : "audio/mpeg") : "video/mp4";

  if (req.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(customFilename)}"; filename*=UTF-8''${encodeURIComponent(customFilename)}`,
      },
    });
  }

  // Helper function to fetch media from upstream with redirect and cookie preservation
  async function fetchUpstream(targetUrl: string): Promise<Response | null> {
    let currentUrl = targetUrl;
    let res: Response | null = null;
    let cookieJar = "";

    for (let hop = 0; hop < 6; hop++) {
      const hopHeaders: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "*/*",
      };
      if (req.headers.has("range")) {
        hopHeaders["Range"] = req.headers.get("range")!;
      }
      try {
        const u = new URL(currentUrl);
        hopHeaders["Referer"] = `${u.protocol}//${u.host}/`;
      } catch (_) {}
      if (cookieJar) {
        hopHeaders["Cookie"] = cookieJar;
      }

      try {
        res = await fetch(currentUrl, {
          headers: hopHeaders,
          redirect: "manual",
        });

        if (res.headers.has("set-cookie")) {
          const sc = res.headers.get("set-cookie")!;
          cookieJar += (cookieJar ? "; " : "") + sc.split(";")[0];
        }

        if (res.status >= 300 && res.status < 400 && res.headers.has("location")) {
          const nextLoc = res.headers.get("location")!;
          currentUrl = new URL(nextLoc, currentUrl).href;
          continue;
        }

        break;
      } catch (err: any) {
        console.warn(`[YouTube Stream Proxy] Hop ${hop} Error:`, err?.message || err);
        return null;
      }
    }
    return res;
  }

  let mediaRes: Response | null = null;
  if (streamUrl) {
    mediaRes = await fetchUpstream(streamUrl);
  }

  // Auto-healing fallback: If initial streamUrl was absent or failed upstream, resolve a fresh stream!
  if (!mediaRes || (!mediaRes.ok && mediaRes.status !== 206)) {
    if (videoId) {
      console.log(`[YouTube Stream Proxy] Upstream streamUrl failed or missing. Auto-healing fresh stream for ${videoId}...`);
      const fresh = await resolveYouTubeStream(videoId, isAudio, quality);
      if (fresh?.streamUrl) {
        streamUrl = fresh.streamUrl;
        mediaRes = await fetchUpstream(streamUrl);
      }
    }
  }

  // If upstream fetch failed or returned non-200/206, return clean error (NEVER 302 redirect browser to googlevideo.com!)
  if (!mediaRes || (!mediaRes.ok && mediaRes.status !== 206)) {
    console.warn(`[YouTube Stream Proxy] Stream resolution exhausted for ${videoId || videoUrl}`);
    return new Response(JSON.stringify({
      success: false,
      error: {
        code: "YOUTUBE_STREAM_FAILED",
        message: "Direct YouTube stream could not be loaded. Please choose another quality or try again.",
        retryable: true,
        desktopFallback: false,
      }
    }), {
      status: 502,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }

  const respHeaders = new Headers(corsHeaders);
  const detectedType = mediaRes.headers.get("content-type");
  const finalMime = isAudio
    ? (customFilename.endsWith(".m4a") || detectedType?.includes("mp4") || detectedType?.includes("m4a") ? "audio/mp4" : "audio/mpeg")
    : (detectedType || mimeType);

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


// ============================================================
// SECTION 2: SOCIAL MEDIA DOWNLOAD ENGINE (IG / FB) (Isolated)
// ============================================================

// Fast SnapSave payload decoder & decryptor for Instagram Reels & Facebook Videos
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
    console.warn("[Social Engine SnapSave Decrypt Warning]:", e);
    return null;
  }
}

async function resolveSocialViaSnapSave(url: string): Promise<{ directUrl: string; thumbnail?: string; formats: Array<{ quality: string; url: string }> } | null> {
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
    console.warn("[Social Engine SnapSave Error]:", err?.message || err);
    return null;
  }
}

// Handler for Social Media POST requests (Instagram / Facebook)
async function handleSocialPost(body: any, reqUrl: URL): Promise<Response> {
  const url = body.url || "";
  const quality = body.quality || "Original";
  const format = body.format || "video";
  const isAudio = format === "audio" || format === "mp3";
  const formatUrl = body.format_url;
  let filename = body.filename || `StreamVault_Social_${Date.now()}.${isAudio ? "mp3" : "mp4"}`;

  const isInstagram = /instagram\.com|instagr\.am/i.test(url);
  const isFacebook = /facebook\.com|fb\.watch/i.test(url);

  let directStream = formatUrl;

  if (!directStream) {
    console.log(`[Social Engine] Resolving via SnapSave: ${url}`);
    const snapRes = await resolveSocialViaSnapSave(url);
    if (snapRes?.directUrl) {
      directStream = snapRes.directUrl;
      console.log(`[Social Engine] Successfully resolved direct stream for ${url}`);
    }
  }

  // If social URL and no direct stream could be scraped by cloud IP
  if (!directStream) {
    return new Response(JSON.stringify({
      success: false,
      error: {
        code: "SOCIAL_STREAM_RETRY",
        message: `${isInstagram ? "Instagram" : "Facebook"} media stream temporarily busy. Please retry or verify link is public.`,
        desktopFallback: false,
        platform: isInstagram ? "instagram" : "facebook",
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Cloud streaming proxy endpoints
  const downloadProxyUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}&audio=${isAudio}&quality=${encodeURIComponent(quality)}&format_url=${encodeURIComponent(directStream)}`;
  const fullDownloadUrl = `${EDGE_BASE}?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}&audio=${isAudio}&quality=${encodeURIComponent(quality)}&format_url=${encodeURIComponent(directStream)}`;

  return new Response(JSON.stringify({
    success: true,
    platform: isInstagram ? "instagram" : "facebook",
    downloadUrl: downloadProxyUrl,
    fullDownloadUrl: fullDownloadUrl,
    streamUrl: directStream,
    audioStreamUrl: undefined,
    audioDownloadUrl: undefined,
    fullAudioDownloadUrl: undefined,
    hasAudioCombined: true,
    filename: filename,
    quality: quality,
    format: isAudio ? "mp3" : "mp4",
    via: "social-cloud-stream",
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Handler for Social Media GET / HEAD stream proxying
async function handleSocialGet(req: Request, reqUrl: URL): Promise<Response> {
  const videoUrl = reqUrl.searchParams.get("url") || "";
  let streamUrl = reqUrl.searchParams.get("format_url");
  const formatParam = reqUrl.searchParams.get("format") || "";
  const isAudio = reqUrl.searchParams.get("audio") === "true" || formatParam === "mp3" || formatParam === "audio";
  let customFilename = reqUrl.searchParams.get("filename") || (isAudio ? "audio.mp3" : "video.mp4");

  const isInstagram = /instagram\.com|instagr\.am/i.test(videoUrl);
  const isFacebook = /facebook\.com|fb\.watch/i.test(videoUrl);

  if (!streamUrl) {
    const snap = await resolveSocialViaSnapSave(videoUrl);
    if (snap?.directUrl) {
      streamUrl = snap.directUrl;
    }
  }

  if (!streamUrl) {
    return new Response(JSON.stringify({
      success: false,
      error: {
        code: "SOCIAL_STREAM_RETRY",
        message: `${isInstagram ? "Instagram" : "Facebook"} media stream temporarily busy. Please try again.`,
        desktopFallback: false,
        platform: isInstagram ? "instagram" : "facebook",
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": isAudio ? "audio/mpeg" : "video/mp4",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(customFilename)}"; filename*=UTF-8''${encodeURIComponent(customFilename)}`,
      },
    });
  }

  const upstreamHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "*/*",
  };
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
    console.warn("[Social Engine Upstream Error]:", streamErr?.message || streamErr);
  }

  if (mediaRes && (mediaRes.ok || mediaRes.status === 206)) {
    const respHeaders = new Headers(corsHeaders);
    const detectedType = mediaRes.headers.get("content-type");
    const finalMime = isAudio ? "audio/mpeg" : (detectedType || "video/mp4");

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

  if (streamUrl) {
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        "Location": streamUrl,
      },
    });
  }

  return new Response(JSON.stringify({
    success: false,
    error: {
      code: "SOCIAL_STREAM_UNAVAILABLE",
      message: "Social media video stream could not be loaded. Please try again.",
      retryable: true,
      desktopFallback: false,
    },
  }), {
    status: 502,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}


// ============================================================
// SECTION 3: TOP-LEVEL ROUTER & DISPATCHER
// ============================================================

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const reqUrl = new URL(req.url);

    // ── Dispatch GET / HEAD Requests ──────────────────────────
    if (req.method === "GET" || req.method === "HEAD") {
      const videoUrl = reqUrl.searchParams.get("url") || "";
      const isSocial = /instagram\.com|instagr\.am|facebook\.com|fb\.watch/i.test(videoUrl);
      const isYouTube = /(?:youtube[.]com|youtu[.]be)/i.test(videoUrl);

      if (isSocial) {
        return await handleSocialGet(req, reqUrl);
      } else if (isYouTube) {
        return await handleYouTubeGet(req, reqUrl);
      } else {
        // Default to YouTube handler if URL is ambiguous or format_url is provided
        return await handleYouTubeGet(req, reqUrl);
      }
    }

    // ── Dispatch POST Requests ────────────────────────────────
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const url = body.url || "";
      const isSocial = /instagram\.com|instagr\.am|facebook\.com|fb\.watch/i.test(url);
      const isYouTube = /(?:youtube[.]com|youtu[.]be)/i.test(url);

      if (isSocial) {
        return await handleSocialPost(body, reqUrl);
      } else if (isYouTube) {
        return await handleYouTubePost(body, reqUrl);
      } else {
        // Fallback: check if videoId matches YouTube pattern
        const ytMatch = url.match(/(?:youtube[.]com\/(?:watch[?]v=|embed\/|shorts\/)|youtu[.]be\/)([a-zA-Z0-9_-]{11})/);
        if (ytMatch) {
          return await handleYouTubePost(body, reqUrl);
        }
        return await handleSocialPost(body, reqUrl);
      }
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (err: any) {
    console.error("[Download Router Fatal Error]:", err?.message || err);
    return new Response(JSON.stringify({
      success: false,
      error: { code: "INTERNAL_ERROR", message: err?.message || "Internal server error", desktopFallback: false },
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
