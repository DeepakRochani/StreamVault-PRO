# STREAMVAULT PRO — DOWNLOAD ENGINE BASELINE (v1.0)

**Status:** VERIFIED & FROZEN  
**Baseline Date:** September 2026  
**Tag:** `streamvault-download-engine-v1.0-verified`

---

## 1. Protected Subsystem & Regression Rules

> [!IMPORTANT]
> **DEVELOPER REGRESSION RULE:**  
> The Desktop / localhost download engine is a **protected subsystem**. Production / Cloud improvements must **never** modify the localhost Desktop engine (`server.js`, `services/ytDlpService.js`, `services/systemService.js`, `main.js`, `preload.js`) unless a separate task explicitly authorizes it and a full localhost regression suite is executed and verified before acceptance.

> [!CAUTION]
> **SAFETY PRINCIPLE:**  
> **Never** solve a Cloud YouTube extraction problem by replacing or modifying the known-good local `yt-dlp` implementation.

---

## 2. Architecture Overview

StreamVault PRO operates a dual-tier download engine tailored for high reliability across web browsers and desktop environments.

### Cloud Engine Architecture

```text
Browser Client (Vercel / Cloudflare)
   ↓
Supabase Edge Function (Deno Runtime)
   ↓
Innertube / YouTube Extraction
   ↓
Direct Binary ReadableStream
   ↓
Browser Download Manager / Local Save
```

#### Cloud Capabilities
* **Public / Progressive Streams:** Delivers direct progressive MP4/M4A video & audio streams with full content-length headers and valid media magic bytes.
* **Audio Downloads:** Direct streaming of supported audio formats (`audio/mp4`, `audio/mpeg`).
* **Binary Stream Pre-Check Validation:** Client-side inspection prevents downloading JSON error bodies as `.mp4` or `.mp3`.
* **Structured Error System:** Standardized JSON error response format containing actionable error codes (`YOUTUBE_BOT_CHALLENGE`, `CLOUD_DOWNLOAD_UNSUPPORTED`, `PROXY_STREAM_ERROR`).
* **Bot-Challenge Detection:** Instantly detects YouTube datacenter IP verification challenges and signals client fallback.
* **Desktop Fallback Signal:** Emits `desktopFallback: true` with guided UI actions for seamless local desktop transition.
* **DASH / High-Resolution Pre-Check:** Automatically catches separate video/audio requests (1080p, 1440p, 4K) at the API gateway level before attempting invalid stream proxying.

#### Cloud Limitations
* **Datacenter IP Challenges:** Cloud edge servers face YouTube IP rate limits and Sign-in/Bot challenges on certain protected videos.
* **No Server-Side FFmpeg Merging:** Edge worker runtimes do not execute native FFmpeg binaries for heavy multi-stream demuxing/remuxing.
* **Restricted Formats:** Separate video-only + audio-only DASH streams cannot be merged purely on edge functions without local processing.

---

### Desktop Engine Architecture

```text
Electron Application / Local Web UI
   ↓
localhost Express Daemon (Port 10000)
   ↓
Native yt-dlp Subprocess
   ↓
Native FFmpeg Subprocess
   ↓
Local Filesystem (~/Downloads/StreamVault)
```

#### Desktop Capabilities
* **Authenticated & Local Session:** Utilizes local browser sessions, residential IP routing, and cookie persistence to bypass cloud bot challenges.
* **High-Resolution Support:** Full native support for 1080p, 1080p60, 1440p (2K), 2160p (4K), and 8K where source streams permit.
* **DASH Multi-Stream Merging:** Native FFmpeg automatic track multiplexing (combines best video stream + best audio stream into a clean `.mp4`/`.mkv`).
* **Format Flexibility:** Supports all formats, codecs (AV1, VP9, H.264, AAC, Opus), playlists, and batch queues.
* **Local Hardware Acceleration:** Leverages client CPU/GPU for rapid transmuxing and audio encoding.

---

## 3. Verified Test Matrix & Reference Cases

| Test Case | Target / Format | Environment | Expected Result | Verified Status |
| :--- | :--- | :--- | :--- | :--- |
| **Test 1: Cloud Video** | `dQw4w9WgXcQ` (360p Progressive MP4) | Cloud Edge | HTTP 200, Binary `video/mp4`, >11MB valid MP4 atom (`ftypmp42`) | **PASS** |
| **Test 2: DASH / High-Res** | `dQw4w9WgXcQ` (1080p/4K) | Cloud Edge | HTTP 422 `CLOUD_DOWNLOAD_UNSUPPORTED`, `desktopFallback: true`, 0 corrupt files | **PASS** |
| **Test 3: Bot Challenge** | `YEYGUjKc2MU` (Protected Video) | Cloud Edge | HTTP 403 `YOUTUBE_BOT_CHALLENGE`, `desktopFallback: true`, structured UI banner | **PASS** |
| **Test 4: Cloud Audio** | `dQw4w9WgXcQ` (128K Audio) | Cloud Edge | HTTP 200, Binary `audio/mp4`, valid audio container | **PASS** |
| **Test 5: Error UX Safety** | Client Pre-flight Guard | Web Frontend | Prevents JSON error bodies from downloading as media files; displays fallback UI | **PASS** |
| **Test 6: Localhost Regression** | Full Local Suite (1080p, 4K, Merging) | Localhost Daemon | Local yt-dlp + FFmpeg operational, merging verified, 0 changes to local engine | **PASS** |

---

## 4. Frozen File Inventory

The following files are strictly **FROZEN** and must not be altered during cloud/production updates:

1. `server.js`
2. `services/ytDlpService.js`
3. `services/systemService.js`
4. `main.js`
5. `preload.js`
