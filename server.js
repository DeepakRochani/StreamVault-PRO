const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
let globalFfmpegPath = require('@ffmpeg-installer/ffmpeg').path;
if (globalFfmpegPath.includes('app.asar')) {
    globalFfmpegPath = globalFfmpegPath.replace('app.asar', 'app.asar.unpacked');
}
const https = require('https');
const http = require('http');
const os = require('os');
const { exec, execFile, execSync, spawn } = require('child_process');


// Resolve local yt-dlp if packaged in Electron or deployed to server
let ytDlpPath = process.platform === 'win32' 
    ? path.join(__dirname, 'bin', 'yt-dlp.exe') 
    : path.join(__dirname, 'bin', 'yt-dlp');
    
if (ytDlpPath.includes('app.asar')) {
    ytDlpPath = ytDlpPath.replace('app.asar', 'app.asar.unpacked');
}
if (!fs.existsSync(ytDlpPath)) {
    // If not in bin folder, fallback to global PATH
    ytDlpPath = 'yt-dlp'; 
}

const app = express();

// Enable custom native CORS headers middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  next();
});
app.use(express.json());
app.use(cookieParser());
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
} else {
    app.use(express.static(__dirname));
}

// Auth Routes
const auth = require('./auth.js');
app.use('/api/auth', auth.router);

// Admin Routes
const adminRouter = require('./admin.js');
const updaterApi = require('./updater-api.js');
app.use('/api/admin', adminRouter);
app.use('/api/system/update', updaterApi);

// Payment Routes
const { router: paymentRouter } = require('./payment.js');
app.use('/api/payment', paymentRouter);

// Ads Analytics Route
app.post('/api/ads/track', (req, res) => {
    const { location, type } = req.body;
    let userId = 'guest';
    const jwt = require('jsonwebtoken');
    const token = req.cookies && req.cookies.token;
    if (token) {
        try {
            const decoded = jwt.verify(token, auth.JWT_SECRET);
            userId = decoded.id;
        } catch(e) {}
    }
    
    if (!location || !type) return res.status(400).json({ error: 'Missing location or type' });
    
    try {
        const db = require('./database.js');
        db.prepare('INSERT INTO ad_events (user_id, ad_location, event_type) VALUES (?, ?, ?)')
          .run(userId, location, type);
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

const db = require('./database.js');

// Set up default downloads folder path intelligently based on platform
const baseDir = process.platform === 'win32' 
    ? (process.env.USERPROFILE || 'C:\\Users\\Default') 
    : (process.env.HOME || process.cwd() || '/tmp');
const DOWNLOADS_DIR = process.env.DOWNLOAD_PATH || path.join(baseDir, 'Downloads', 'StreamVault');
const DIRS = [
  DOWNLOADS_DIR,
  path.join(DOWNLOADS_DIR, '.temp'),
  path.join(DOWNLOADS_DIR, 'Videos'),
  path.join(DOWNLOADS_DIR, 'Audio'),
  path.join(DOWNLOADS_DIR, 'Converted'),
  path.join(DOWNLOADS_DIR, 'Exports')
];

for (const dir of DIRS) {
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (e) {
            console.error(`Failed to create directory ${dir}: ${e.message}`);
        }
    }
}

// Helper to route file by extension/type
function getFinalDestPath(filename, forceType) {
    if (forceType) return path.join(DOWNLOADS_DIR, forceType, filename);
    
    const ext = path.extname(filename).toLowerCase();
    if (['.mp3', '.m4a', '.wav'].includes(ext)) {
        return path.join(DOWNLOADS_DIR, 'Audio', filename);
    }
    return path.join(DOWNLOADS_DIR, 'Videos', filename);
}

// In-memory downloads store
const downloads = {};

function logDownloadIfToken(id) {
    const job = downloads[id];
    if (job && job.userToken) {
        let platform = 'Generic';
        if (job.url.includes('youtube')) platform = 'YouTube';
        else if (job.url.includes('instagram')) platform = 'Instagram';
        else if (job.url.includes('facebook') || job.url.includes('fb.watch')) platform = 'Facebook';
        
        let size = job.contentLength || 0;
        if (!size && fs.existsSync(job.path)) {
            try { size = fs.statSync(job.path).size; } catch(e) {}
        }
        
        if (auth && auth.logDownloadWithToken) auth.logDownloadWithToken(job.userToken, platform, job.filename, job.path, size);
    }
}

// Helper: check free disk space — cross-platform (Windows + Linux/Render)
function getFreeDiskSpace(driveLetter = 'C') {
  try {
    if (process.platform === 'win32') {
      const stdout = execSync(`powershell -Command "(Get-Volume -DriveLetter ${driveLetter}).SizeRemaining"`, { encoding: 'utf8' });
      const bytes = parseInt(stdout.trim(), 10);
      if (!isNaN(bytes)) return bytes;
    } else {
      // Linux (Render): use df to get available bytes on the mounted disk
      const stdout = execSync(`df -k "${DOWNLOADS_DIR}" | tail -1 | awk '{print $4}'`, { encoding: 'utf8' });
      const kb = parseInt(stdout.trim(), 10);
      if (!isNaN(kb)) return kb * 1024;
    }
  } catch (e) {
    console.error("Failed to fetch disk space, falling back:", e.message);
  }
  // Fallback: assume 10 GB free if command fails
  return 10 * 1024 * 1024 * 1024;
}

// Helper: verify remote stream URL exists and is readable before fetching bytes
function checkMediaStreamExists(url, callback) {
  const protocol = url.startsWith('https') ? https : http;
  try {
    const req = protocol.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Range': 'bytes=0-1023' // request just first 1KB to confirm stream is readable
      }
    }, (res) => {
      req.destroy(); // immediately stop stream reading after fetching headers
      const ct = (res.headers['content-type'] || '').toLowerCase();
      const isHtml = ct.includes('text/html');

      // 200 OK or 206 Partial Content = stream is accessible
      if ((res.statusCode === 200 || res.statusCode === 206) && !isHtml) {
        callback(null, true);
      } else if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow one level of redirect
        const redirectUrl = new URL(res.headers.location, url).href;
        console.log(`[PreFlight] Following redirect: ${redirectUrl}`);
        checkMediaStreamExists(redirectUrl, callback);
      } else if (isHtml) {
        // Platform page, not a direct media stream — warn but don't block
        console.warn(`[PreFlight] URL returns HTML page (not a direct media stream). Status: ${res.statusCode} Content-Type: ${ct}`);
        callback(new Error(`URL returns an HTML page, not a direct media stream. This URL requires server-side extraction (Status ${res.statusCode}).`));
      } else {
        callback(new Error(`Server responded with HTTP Status ${res.statusCode} (${res.statusMessage || 'Unreachable'})`));
      }
    });

    req.on('error', (err) => {
      callback(err);
    });

    req.on('timeout', () => {
      req.destroy();
      callback(new Error('Connection timed out while verifying media stream accessibility'));
    });
  } catch (err) {
    callback(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Media integrity helpers
// ─────────────────────────────────────────────────────────────────────────────

// Known media container magic-byte signatures
const MEDIA_SIGNATURES = [
  // MP4 / ISO BMFF: bytes 4-7 are 'ftyp' (0x66 0x74 0x79 0x70)
  { name: 'mp4',  check: b => b.length >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 },
  // MP4 wide atom: starts with 00 00 00 01 or 00 00 00 08
  { name: 'mp4',  check: b => b.length >= 8 && b[0] === 0x00 && b[1] === 0x00 && (b[3] === 0x01 || b[3] === 0x08) && b[4] === 0x6D && b[5] === 0x64 },
  // WebM / MKV: EBML header 1A 45 DF A3
  { name: 'webm', check: b => b.length >= 4 && b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3 },
  // OGG: 4F 67 67 53 (OggS)
  { name: 'ogg',  check: b => b.length >= 4 && b[0] === 0x4F && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53 },
  // FLV: 46 4C 56 01
  { name: 'flv',  check: b => b.length >= 3 && b[0] === 0x46 && b[1] === 0x4C && b[2] === 0x56 },
  // AVI: RIFF....AVI
  { name: 'avi',  check: b => b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x41 && b[9] === 0x56 && b[10] === 0x49 },
  // WAV: RIFF....WAVE
  { name: 'wav',  check: b => b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45 },
  // MP3 with ID3 tag: 49 44 33
  { name: 'mp3',  check: b => b.length >= 3 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33 },
  // MP3 sync word: FF FB or FF F3 or FF F2
  { name: 'mp3',  check: b => b.length >= 2 && b[0] === 0xFF && (b[1] === 0xFB || b[1] === 0xF3 || b[1] === 0xF2) },
  // AAC ADTS: FF F1 or FF F9
  { name: 'aac',  check: b => b.length >= 2 && b[0] === 0xFF && (b[1] === 0xF1 || b[1] === 0xF9) },
  // QuickTime MOV: 00 00 00 14 66 74 79 70 71 74
  { name: 'mov',  check: b => b.length >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 },
];

// Detect if bytes match non-media content (HTML, JSON, XML, text)
const NON_MEDIA_PATTERNS = [
  { name: 'HTML',  check: b => b.length >= 5 && String.fromCharCode(...b.slice(0, 5)).toLowerCase().startsWith('<!doc') },
  { name: 'HTML',  check: b => b.length >= 5 && String.fromCharCode(...b.slice(0, 5)).toLowerCase().startsWith('<html') },
  { name: 'HTML',  check: b => b.length >= 1 && b[0] === 0x3C && b[1] === 0x21 }, // starts with <!
  { name: 'JSON',  check: b => b.length >= 1 && (b[0] === 0x7B || b[0] === 0x5B) }, // { or [
  { name: 'XML',   check: b => b.length >= 5 && String.fromCharCode(...b.slice(0, 5)) === '<?xml' },
  { name: 'text',  check: b => b.length >= 4 && String.fromCharCode(...b.slice(0, 4)) === 'HTTP' },
];

/**
 * Sniff the first bytes of a Buffer and classify the content.
 * Returns { isMedia, format, magicHex, signature }
 */
function sniffMediaBytes(buf) {
  const magicHex = Array.from(buf.slice(0, 16)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

  // Check non-media first (higher priority)
  for (const pat of NON_MEDIA_PATTERNS) {
    if (pat.check(buf)) {
      const textPreview = buf.slice(0, 40).toString('utf8').replace(/[\r\n]/g, ' ').replace(/[^\x20-\x7E]/g, '.');
      return { isMedia: false, format: pat.name, magicHex, signature: textPreview };
    }
  }

  // Check known media signatures
  for (const sig of MEDIA_SIGNATURES) {
    if (sig.check(buf)) {
      return { isMedia: true, format: sig.name, magicHex, signature: sig.name };
    }
  }

  // Unknown — treat as potentially valid (don't reject unknown containers)
  return { isMedia: null, format: 'unknown', magicHex, signature: 'unrecognized container' };
}

// NON-MEDIA content-type prefixes — reject immediately if server returns these
const BLOCKED_CONTENT_TYPES = [
  'text/html', 'text/plain', 'text/xml', 'text/css', 'text/javascript',
  'application/json', 'application/javascript', 'application/x-www-form-urlencoded',
  'application/xml', 'application/xhtml+xml'
];

function isBlockedContentType(ct) {
  const lower = ct.toLowerCase();
  return BLOCKED_CONTENT_TYPES.some(blocked => lower.startsWith(blocked));
}

// Helper: download media stream and write to disk
function downloadMedia(url, destPath, downloadId, callback) {
  let fileStream = null;
  let clientRequest = null;
  let completed = false;
  let firstChunkSniffed = false;

  function cleanupAndFail(err) {
    if (fileStream) {
      try { fileStream.end(); } catch (_) {}
      fileStream = null;
    }
    // Delete any partial/corrupt file
    try {
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    } catch (delErr) {
      console.error(`[Cleanup] Failed to delete partial file: ${delErr.message}`);
    }
    if (downloads[downloadId]) {
      downloads[downloadId].status = 'failed';
      downloads[downloadId].error = err.message;
      downloads[downloadId].speed = '0 MB/s';
      downloads[downloadId].log.push(`ABORT: ${err.message}`);
    }
    callback(err);
  }

  function cleanup() {
    if (fileStream) {
      try { fileStream.end(); } catch (_) {}
      fileStream = null;
    }
  }

  function startRequest(targetUrl) {
    const protocol = targetUrl.startsWith('https') ? https : http;
    
    downloads[downloadId].status = 'downloading';
    downloads[downloadId].startTime = Date.now();

    clientRequest = protocol.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'video/*, audio/*, application/octet-stream, */*'
      }
    }, (res) => {
      // Follow redirect codes (301, 302, 303, 307, 308)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, targetUrl).href;
        console.log(`[Redirect] Download ${downloadId} redirecting to: ${redirectUrl}`);
        downloads[downloadId].log.push(`HTTP ${res.statusCode} Redirect to: ${redirectUrl}`);
        startRequest(redirectUrl);
        return;
      }

      // Accept 200 OK and 206 Partial Content as valid responses
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        const err = new Error(`Server returned HTTP ${res.statusCode}: ${res.statusMessage || 'Error'}`);
        downloads[downloadId].log.push(`HTTP error: ${err.message}`);
        cleanupAndFail(err);
        return;
      }

      const contentType = (res.headers['content-type'] || 'application/octet-stream').split(';')[0].trim();
      const contentLength = res.headers['content-length'] ? parseInt(res.headers['content-length'], 10) : 0;
      
      downloads[downloadId].contentType = contentType;
      downloads[downloadId].contentLength = contentLength;
      downloads[downloadId].log.push(`Response status: ${res.statusCode}`);
      downloads[downloadId].log.push(`Content-Type: ${contentType}`);
      downloads[downloadId].log.push(`Content-Length: ${contentLength} bytes`);

      // ── CONTENT-TYPE GATE ───────────────────────────────────────────────────
      // Reject non-media MIME types before writing a single byte to disk.
      if (isBlockedContentType(contentType)) {
        const errMsg = `Server returned "${contentType}" instead of video/audio data. ` +
          `This URL serves a web page or text, not a downloadable media stream. ` +
          `Platform videos (YouTube, Instagram, Facebook) require server-side extraction.`;
        console.error(`[ContentType Gate] BLOCKED ID ${downloadId}: ${errMsg}`);
        downloads[downloadId].log.push(`BLOCKED by Content-Type gate: ${contentType}`);
        res.destroy(); // don't read the body at all
        cleanupAndFail(new Error(errMsg));
        return;
      }

      console.log(`[ContentType Gate] PASSED ID ${downloadId}: ${contentType} — proceeding to write stream`);
      downloads[downloadId].log.push(`Content-Type gate passed: ${contentType}`);

      // Initialize file write stream
      try {
        fileStream = fs.createWriteStream(destPath);
        fileStream.on('error', (err) => {
          console.error(`[Daemon writeStream error ID ${downloadId}]:`, err);
          cleanupAndFail(new Error(`File write error: ${err.message}`));
        });
      } catch (streamErr) {
        console.error(`[Daemon writeStream creation failed ID ${downloadId}]:`, streamErr);
        cleanupAndFail(new Error(`Stream initialization failure: ${streamErr.message}`));
        return;
      }

      let loaded = 0;
      let lastLoaded = 0;
      let lastTime = Date.now();

      res.on('data', (chunk) => {
        // Abort if paused/cancelled
        if (!downloads[downloadId] || downloads[downloadId].status === 'paused' || downloads[downloadId].status === 'cancelled') {
          cleanup();
          res.destroy();
          return;
        }

        // ── FIRST-CHUNK MAGIC-BYTE SNIFF ──────────────────────────────────────
        // On the very first chunk, inspect bytes to detect HTML/JSON masquerading as media.
        if (!firstChunkSniffed && chunk.length >= 4) {
          firstChunkSniffed = true;
          const sniff = sniffMediaBytes(chunk);
          downloads[downloadId].log.push(`Magic-byte sniff: format=${sniff.format}, isMedia=${sniff.isMedia}, hex=[${sniff.magicHex}]`);
          console.log(`[MagicByte] ID ${downloadId}: format=${sniff.format}, isMedia=${sniff.isMedia}, hex=[${sniff.magicHex.slice(0,23)}]`);

          if (sniff.isMedia === false) {
            // This is NOT a video file — it's HTML, JSON, or text. Stop immediately.
            const errMsg = `Downloaded content is ${sniff.format}, not a video file. ` +
              `First bytes: [${sniff.magicHex.slice(0, 23)}] = "${sniff.signature.slice(0, 60)}". ` +
              `Platform videos require server-side extraction (yt-dlp). Direct URL is not a media stream.`;
            console.error(`[MagicByte Gate] BLOCKED ID ${downloadId}: ${errMsg}`);
            res.destroy();
            cleanupAndFail(new Error(errMsg));
            return;
          }
        }

        if (fileStream) {
          fileStream.write(chunk);
        }
        loaded += chunk.length;
        downloads[downloadId].loaded = loaded;

        // Compute progress
        if (contentLength > 0) {
          downloads[downloadId].progress = Math.min(99, (loaded / contentLength) * 100);
        } else {
          const estimatedSize = 1024 * 1024 * 50;
          downloads[downloadId].progress = Math.min(99, (loaded / estimatedSize) * 100);
        }

        // Calculate transfer speed every 500ms
        const now = Date.now();
        const elapsed = now - lastTime;
        if (elapsed >= 500) {
          const bytesDiff = loaded - lastLoaded;
          const speedMBps = (bytesDiff / elapsed * 1000) / (1024 * 1024);
          downloads[downloadId].speed = `${speedMBps.toFixed(1)} MB/s`;
          lastLoaded = loaded;
          lastTime = now;
        }
      });

      res.on('end', () => {
        if (completed) return;
        completed = true;
        
        if (!fileStream) { callback(new Error('Stream ended with no file written')); return; }

        fileStream.end(() => {
          downloads[downloadId].status = 'saving';
          downloads[downloadId].log.push('Stream ended. Running full media integrity validation...');

          setTimeout(() => {
            try {
              // ── VALIDATION STEP 1: File must exist ─────────────────────────
              if (!fs.existsSync(destPath)) {
                throw new Error(`File was not created at: ${destPath}`);
              }

              // ── VALIDATION STEP 2: File must be non-zero ───────────────────
              const stats = fs.statSync(destPath);
              const sizeBytes = stats.size;
              downloads[downloadId].log.push(`File size on disk: ${sizeBytes} bytes (${(sizeBytes / 1024).toFixed(1)} KB)`);
              if (sizeBytes === 0) {
                throw new Error('Downloaded file is 0 bytes — stream was empty or truncated.');
              }

              // ── VALIDATION STEP 3: Magic-byte integrity check ──────────────
              // Read first 16 bytes of the saved file and verify it is a real media container.
              const fd = fs.openSync(destPath, 'r');
              const headerBuf = Buffer.alloc(16);
              fs.readSync(fd, headerBuf, 0, 16, 0);
              fs.closeSync(fd);

              const finalSniff = sniffMediaBytes(headerBuf);
              const magicHex = finalSniff.magicHex;

              downloads[downloadId].log.push(`Final magic-byte check: format=${finalSniff.format}, isMedia=${finalSniff.isMedia}, hex=[${magicHex}]`);
              downloads[downloadId].detectedFormat = finalSniff.format;
              downloads[downloadId].magicBytes = magicHex;
              downloads[downloadId].isValidMedia = finalSniff.isMedia !== false;

              console.log(`[Validation] ID ${downloadId} — size=${sizeBytes}B, format=${finalSniff.format}, isMedia=${finalSniff.isMedia}, hex=[${magicHex.slice(0,23)}]`);

              if (finalSniff.isMedia === false) {
                // File exists and has size > 0 but contains HTML/JSON/text — corrupt download
                throw new Error(
                  `File contains ${finalSniff.format} data, not a valid media file. ` +
                  `Magic bytes: [${magicHex.slice(0,23)}] = "${finalSniff.signature.slice(0,80)}". ` +
                  `This URL serves a web page, not a downloadable video stream.`
                );
              }

              // ── VALIDATION STEP 4: Truncation check ───────────────────────
              // If Content-Length was provided, verify we received all bytes.
              if (contentLength > 0 && sizeBytes < contentLength * 0.95) {
                // Allow 5% tolerance for slight stream mismatches
                throw new Error(
                  `File appears truncated: expected ~${contentLength} bytes but only ${sizeBytes} bytes saved ` +
                  `(${(sizeBytes / contentLength * 100).toFixed(1)}% received). Download may be incomplete.`
                );
              }

              // ── ALL VALIDATIONS PASSED ─────────────────────────────────────
              // The file stays in the .temp directory
              downloads[downloadId].path = destPath;

              downloads[downloadId].status = 'completed';
              logDownloadIfToken(downloadId);
              downloads[downloadId].progress = 100;
              downloads[downloadId].speed = '0 MB/s';
              downloads[downloadId].log.push(
                `File verification: PASSED — format=${finalSniff.format}, ` +
                `size=${sizeBytes} bytes, magic=[${magicHex.slice(0,23)}]`
              );
              console.log(`[Validation] ID ${downloadId} PASSED — ${finalSniff.format}, ${sizeBytes} bytes, path: ${destPath}`);
              callback(null);

            } catch (err) {
              downloads[downloadId].status = 'failed';
              downloads[downloadId].error = err.message;
              downloads[downloadId].speed = '0 MB/s';
              downloads[downloadId].log.push(`File verification FAILED: ${err.message}`);
              console.error(`[Validation] ID ${downloadId} FAILED:`, err.message);
              // Delete the corrupt/invalid file
              try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (_) {}
              callback(err);
            }
          }, 500);
        });
      });

      res.on('error', (err) => {
        downloads[downloadId].log.push(`Network stream error: ${err.message}`);
        cleanupAndFail(err);
      });
    });

    clientRequest.on('error', (err) => {
      downloads[downloadId].log.push(`Connection request error: ${err.message}`);
      cleanupAndFail(err);
    });
  }

  startRequest(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// REST Endpoints
// ─────────────────────────────────────────────────────────────────────────────

// 0a. Validate a saved file — magic-byte check + size report
app.post('/api/validate-file', (req, res, next) => {
  try {
    const { path: filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'path is required' });

    const resolvedPath = path.resolve(filePath);
    // Security: only allow files inside the Downloads directory
    if (!resolvedPath.startsWith(DOWNLOADS_DIR)) {
      return res.status(403).json({ error: 'Access denied outside Downloads directory' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({
        path: resolvedPath,
        sizeBytes: 0,
        isValidMedia: false,
        detectedFormat: 'missing',
        magicBytes: '',
        error: 'File does not exist'
      });
    }

    const stats = fs.statSync(resolvedPath);
    const sizeBytes = stats.size;

    if (sizeBytes === 0) {
      return res.json({
        path: resolvedPath,
        sizeBytes: 0,
        isValidMedia: false,
        detectedFormat: 'empty',
        magicBytes: '',
        error: 'File is 0 bytes'
      });
    }

    // Read first 16 bytes
    const fd = fs.openSync(resolvedPath, 'r');
    const buf = Buffer.alloc(Math.min(16, sizeBytes));
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);

    const sniff = sniffMediaBytes(buf);

    return res.json({
      path: resolvedPath,
      sizeBytes,
      sizeMB: parseFloat((sizeBytes / (1024 * 1024)).toFixed(2)),
      isValidMedia: sniff.isMedia !== false,
      isDefinitelyMedia: sniff.isMedia === true,
      detectedFormat: sniff.format,
      magicBytes: sniff.magicHex,
      contentSignature: sniff.signature,
      error: sniff.isMedia === false
        ? `File contains ${sniff.format} data, not video/audio. Content: "${sniff.signature.slice(0, 80)}"`
        : null
    });
  } catch (err) {
    next(err);
  }
});

// 0b. Probe a file — magic-byte analysis + ffprobe if available
app.post('/api/probe-file', (req, res, next) => {
  try {
    const { path: filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'path is required' });

    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(DOWNLOADS_DIR)) {
      return res.status(403).json({ error: 'Access denied outside Downloads directory' });
    }
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'File does not exist', path: resolvedPath });
    }

    const stats = fs.statSync(resolvedPath);
    const sizeBytes = stats.size;

    // Magic-byte read
    const fd = fs.openSync(resolvedPath, 'r');
    const buf = Buffer.alloc(Math.min(16, sizeBytes));
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const sniff = sniffMediaBytes(buf);

    const baseResult = {
      path: resolvedPath,
      sizeBytes,
      sizeMB: parseFloat((sizeBytes / (1024 * 1024)).toFixed(2)),
      detectedFormat: sniff.format,
      isValidMedia: sniff.isMedia !== false,
      magicBytes: sniff.magicHex,
      ffprobeAvailable: false,
      validationMethod: 'magic-byte'
    };

    // Try ffprobe for detailed codec info
    exec(`ffprobe -v quiet -print_format json -show_streams -show_format "${resolvedPath}" 2>&1`, { timeout: 10000 }, (err, stdout) => {
      if (err || !stdout) {
        // ffprobe not available — return magic-byte result only
        return res.json(baseResult);
      }
      try {
        const probe = JSON.parse(stdout);
        const videoStream = (probe.streams || []).find(s => s.codec_type === 'video');
        const audioStream = (probe.streams || []).find(s => s.codec_type === 'audio');
        const fmt = probe.format || {};
        return res.json({
          ...baseResult,
          ffprobeAvailable: true,
          validationMethod: 'ffprobe',
          containerFormat: fmt.format_name || sniff.format,
          duration: parseFloat(fmt.duration || 0),
          bitrate: parseInt(fmt.bit_rate || 0, 10),
          videoCodec: videoStream ? videoStream.codec_name : null,
          audioCodec: audioStream ? audioStream.codec_name : null,
          width: videoStream ? videoStream.width : null,
          height: videoStream ? videoStream.height : null,
          frameRate: videoStream ? videoStream.r_frame_rate : null,
        });
      } catch (_) {
        return res.json(baseResult);
      }
    });
  } catch (err) {
    next(err);
  }
});

// 0c. URL resolution helper — follows redirects server-side to find real media URL
app.post('/api/resolve-url', (req, res, next) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });

    let parsedUrl;
    try { parsedUrl = new URL(url); } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format', details: e.message });
    }

    const protocol = url.startsWith('https') ? https : http;
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'HEAD',
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'video/*, audio/*, */*'
      }
    };

    let resolvedUrl = url;
    let redirectCount = 0;
    const MAX_REDIRECTS = 10;

    function doHead(targetUrl) {
      if (redirectCount >= MAX_REDIRECTS) {
        return res.status(500).json({ error: 'Too many redirects', resolvedUrl: targetUrl });
      }

      const proto = targetUrl.startsWith('https') ? https : http;
      const parsed = new URL(targetUrl);
      proto.request({
        hostname: parsed.hostname,
        port: parsed.port || (targetUrl.startsWith('https') ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'HEAD',
        timeout: 8000,
        headers: options.headers
      }, (response) => {
        const ct = (response.headers['content-type'] || '').toLowerCase();
        const location = response.headers['location'];

        if (response.statusCode >= 300 && response.statusCode < 400 && location) {
          redirectCount++;
          const nextUrl = new URL(location, targetUrl).href;
          console.log(`[ResolveURL] Redirect ${redirectCount}: ${nextUrl}`);
          doHead(nextUrl);
          return;
        }

        const isMedia = ct.includes('video') || ct.includes('audio') || ct.includes('octet-stream') || ct.includes('mp4') || ct.includes('mpeg');
        const isHtml = ct.includes('text/html');

        return res.json({
          resolvedUrl: targetUrl,
          originalUrl: url,
          statusCode: response.statusCode,
          contentType: ct,
          contentLength: response.headers['content-length'] || null,
          isDirectMedia: isMedia && !isHtml,
          isHtmlPage: isHtml,
          redirectCount
        });
      }).on('error', (err) => {
        return res.status(500).json({ error: 'Resolution request failed', details: err.message, resolvedUrl: targetUrl });
      }).on('timeout', function() {
        this.destroy();
        return res.status(500).json({ error: 'Resolution request timed out', resolvedUrl: targetUrl });
      }).end();
    }

    doHead(url);
  } catch (err) {
    next(err);
  }
});

// 1. Health checks & Status reporting
const healthCheck = (req, res) => {
  try {
    // Check filesystem write access
    fs.accessSync(DOWNLOADS_DIR, fs.constants.W_OK);
    
    return res.json({
      status: "running",
      download_engine: "ready",
      filesystem: "ready",
      network: "ready"
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      download_engine: "ready",
      filesystem: "error",
      network: "ready",
      error: err.message
    });
  }
};

app.get('/health', healthCheck);
app.get('/status', healthCheck);
app.get('/api/health', healthCheck);
app.get('/api/status', healthCheck);

// Serve File to Browser
app.get('/api/serve-file', (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).send("Path required");
    
    // Security: Only allow serving from the local DOWNLOADS_DIR
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(DOWNLOADS_DIR))) {
      console.warn(`[Security] Blocked attempt to download file outside downloads dir: ${resolvedPath}`);
      return res.status(403).send("Forbidden: Can only download from the permitted directory");
    }

    res.download(resolvedPath, req.query.filename || path.basename(resolvedPath), (err) => {
      if (err) {
        console.error(`[Express] Error serving file ${resolvedPath}:`, err);
        if (!res.headersSent) {
          res.status(500).send("File could not be downloaded.");
        }
      } else {
        // Automatically clean up the .temp file after 1 hour to allow browser download manager to make multiple requests
        setTimeout(() => {
          try {
            if (resolvedPath.includes('.temp') || resolvedPath.includes('.streamvault')) {
              if (fs.existsSync(resolvedPath)) {
                  fs.unlinkSync(resolvedPath);
                  console.log(`[Cleanup] Deleted transient file after delay: ${resolvedPath}`);
              }
            }
          } catch(e) {
            console.error("[Cleanup] Failed to delete file:", e);
          }
        }, 60 * 60 * 1000); // 1 hour delay
      }
    });
  } catch (err) {
    console.error("[Express] /api/serve-file crash:", err);
    res.status(500).send("Server error");
  }
});

// Simple in-memory cache for metadata
const metadataCache = new Map();

// Fetch Metadata
app.delete('/api/metadata', (req, res) => {
  const url = req.query.url || req.body.url;
  if (url && metadataCache.has(url)) {
    metadataCache.delete(url);
  }
  return res.json({ success: true });
});

app.post('/api/metadata', (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });

    console.log(`[Daemon POST /api/metadata] Fetching metadata for: ${url}`);
    
    // Helper to cache and send
    const sendResponse = (data) => {
      // Only cache if we actually found playable formats
      if ((data.videoFormats && data.videoFormats.length > 0) || (data.audioFormats && data.audioFormats.length > 0)) {
          metadataCache.set(url, { data: data, timestamp: Date.now() });
      }
      return res.json(data);
    };

    // Check Cache
    if (metadataCache.has(url)) {
      const cached = metadataCache.get(url);
      // Cache expiration: 1 hour (3600000 ms)
      if (Date.now() - cached.timestamp < 3600000) {
        console.log(`[Daemon] Serving metadata from cache for: ${url}`);
        return res.json(cached.data);
      } else {
        metadataCache.delete(url); // Expired
      }
    }

    // Use yt-dlp --dump-json to extract metadata quickly without downloading
    const args = ['--dump-json', '--no-warnings', '--no-playlist'];
    
    args.push(url);
    
    const process = spawn(ytDlpPath, args);
    let output = '';
    let errorOutput = '';

    process.on('error', (err) => {
        console.error(`[Daemon] Failed to start yt-dlp process:`, err);
        errorOutput += `Failed to start: ${err.message}`;
        // Manually trigger fallback by calling the logic inside close
        // But since we can't easily jump, we can just let it timeout or return an error directly.
        return res.status(500).json({ error: 'Internal Server Error', details: `Extraction engine failed to start: ${err.message}` });
    });

    process.stdout.on('data', (data) => { output += data.toString(); });
    process.stderr.on('data', (data) => { errorOutput += data.toString(); });

    process.on('close', async (code) => {
      if (code === 0) {
        try {
          const metadata = JSON.parse(output);
          
          let sizes = { v4k: null, v1080: null, v720: null, a320: null, a256: null, a128: null };
          let bestAudioSize = 0;
          let videoFormats = [];
          let audioFormats = [];

          const formatBytes = (bytes) => {
              if (!bytes || bytes === 0) return 'Unknown';
              const k = 1024;
              const suffix = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
              const i = Math.floor(Math.log(bytes) / Math.log(k));
              return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + suffix[i];
          };

          if (metadata.formats) {
              const audios = metadata.formats.filter(f => f.vcodec === 'none' && f.acodec !== 'none');
              audios.sort((a,b) => (b.filesize || b.filesize_approx || 0) - (a.filesize || a.filesize_approx || 0));
              if (audios.length > 0) bestAudioSize = audios[0].filesize || audios[0].filesize_approx || 0;

              const getVidSize = (minH) => {
                  const vids = metadata.formats.filter(f => f.height >= minH);
                  if (vids.length === 0) return null;
                  vids.sort((a,b) => (a.height - b.height));
                  const closest = vids.filter(f => f.height === vids[0].height);
                  closest.sort((a,b) => (b.filesize || b.filesize_approx || 0) - (a.filesize || a.filesize_approx || 0));
                  let s = closest[0].filesize || closest[0].filesize_approx || 0;
                  if (s > 0 && closest[0].acodec === 'none') s += bestAudioSize;
                  return s > 0 ? s : null;
              };

              sizes.v4k = getVidSize(2160);
              sizes.v1080 = getVidSize(1080);
              sizes.v720 = getVidSize(720) || getVidSize(360);

              const getAudSize = (abr) => {
                  const matching = audios.filter(f => f.abr && f.abr >= abr);
                  if (matching.length > 0) {
                     matching.sort((a,b) => a.abr - b.abr);
                     return matching[0].filesize || matching[0].filesize_approx || null;
                  }
                  return null;
              };
              sizes.a320 = getAudSize(320);
              sizes.a256 = getAudSize(256);
              sizes.a128 = getAudSize(128) || bestAudioSize;
              
              // --- EXACT FORMAT EXTRACTION (NEW) ---
              const dur = metadata.duration || 0;
              
              // Helper to build explicit audio formats
              const buildAudio = (abr, label, recommended) => {
                  let sizeBytes = dur > 0 ? dur * (abr * 1024 / 8) : 0;
                  audioFormats.push({
                      id: `${abr}K`, // Passed to --audio-quality directly
                      quality: label,
                      abr: abr,
                      sizeStr: sizeBytes > 0 ? formatBytes(sizeBytes) : 'Unknown',
                      bytes: sizeBytes,
                      recommended
                  });
              };
              
              buildAudio(640, '640 kbps', true);
              buildAudio(320, '320 kbps', false);
              buildAudio(192, '192 kbps', false);
              buildAudio(128, '128 kbps', false);
              buildAudio(64, '64 kbps', false);

              // Helper to build explicit video formats
              const buildVideo = (minH, label, recommended, estMbps) => {
                  const vids = metadata.formats.filter(f => f.vcodec !== 'none' && f.height >= minH);
                  if (vids.length === 0) return;
                  vids.sort((a,b) => (a.height - b.height));
                  const closest = vids.filter(f => f.height === vids[0].height);
                  closest.sort((a,b) => (b.fps||0) - (a.fps||0) || (b.tbr||0) - (a.tbr||0));
                  
                  const f = closest[0];
                  let s = f.filesize || f.filesize_approx || 0;
                  if (s > 0 && f.acodec === 'none') s += bestAudioSize;
                  if (s === 0) s = dur * (estMbps * 1024 * 1024 / 8);
                  
                  const resDisplay = f.width && f.height ? `${f.width}x${f.height}` : label;
                  const codec = (f.vcodec || '').split('.')[0] || 'Unknown';
                  
                  videoFormats.push({
                      id: f.format_id,
                      quality: label,
                      resolution: resDisplay,
                      fps: f.fps ? `${f.fps}fps` : '',
                      codec: codec,
                      sizeStr: formatBytes(s),
                      bytes: s,
                      recommended
                  });
              };
              buildVideo(2160, '4K', true, 15);
              buildVideo(1440, '2K', false, 8);
              buildVideo(1080, '1080p', false, 4);
              buildVideo(720, '720p', false, 1.5);
              buildVideo(480, '480p', false, 0.8);
              buildVideo(360, '360p', false, 0.4);
              
              // If NO formats matched because height is missing from metadata (common on Instagram/FB/TikTok)
              if (videoFormats.length === 0) {
                  const anyVideo = metadata.formats.filter(f => f.vcodec !== 'none');
                  if (anyVideo.length > 0) {
                      const bestVid = anyVideo[anyVideo.length - 1]; // usually last is best in yt-dlp
                      let s = bestVid.filesize || bestVid.filesize_approx || 0;
                      if (s > 0 && bestVid.acodec === 'none') s += bestAudioSize;
                      videoFormats.push({
                          id: bestVid.format_id || 'bestvideo',
                          quality: 'Original Quality',
                          resolution: bestVid.resolution || 'Unknown',
                          fps: bestVid.fps ? `${bestVid.fps}fps` : '',
                          codec: (bestVid.vcodec || '').split('.')[0] || 'Unknown',
                          sizeStr: formatBytes(s),
                          bytes: s,
                          recommended: true
                      });
                  }
              }
              
              // Filter unique by quality label, sort by bytes desc
              videoFormats = videoFormats.filter((v,i,a)=>a.findIndex(t=>(t.quality===v.quality))===i);
              videoFormats.sort((a,b) => b.bytes - a.bytes);
          }

          const dur = metadata.duration || 0;
          if (dur > 0) {
             if (!sizes.v4k) sizes.v4k = dur * (15 * 1024 * 1024 / 8); 
             if (!sizes.v1080) sizes.v1080 = dur * (4 * 1024 * 1024 / 8); 
             if (!sizes.v720) sizes.v720 = dur * (1.5 * 1024 * 1024 / 8); 
             if (!sizes.a320) sizes.a320 = dur * (320 * 1024 / 8);
             if (!sizes.a256) sizes.a256 = dur * (256 * 1024 / 8);
             if (!sizes.a128) sizes.a128 = dur * (128 * 1024 / 8);
          }

          // Compute best overall (Original) size
          const allVids = (metadata.formats || []).filter(f => f.vcodec !== 'none');
          allVids.sort((a,b) => (b.height||0) - (a.height||0));
          const bestVid = allVids[0];
          let originalSize = bestVid ? (bestVid.filesize || bestVid.filesize_approx || 0) : 0;
          if (originalSize > 0 && bestVid && bestVid.acodec === 'none') originalSize += bestAudioSize;

          if (videoFormats.length === 0 && audioFormats.length === 0) {
              return res.status(500).json({
                  success: false,
                  actual_error: 'Extraction succeeded but no playable media formats were found in the response.',
                  stdout: output,
                  stderr: errorOutput,
                  exit_code: code,
                  yt_dlp_command: `${ytDlpPath} ${args.join(' ')}`
              });
          }

          return sendResponse({
            title: metadata.title || null,
            thumbnail: metadata.thumbnail || null,
            duration: metadata.duration || null,
            platform: metadata.extractor_key || null,
            videoFormats: videoFormats,
            audioFormats: audioFormats,
            sizes: {
                Original: originalSize > 0 ? formatBytes(originalSize) : 'Unknown',
                v4k:  formatBytes(sizes.v4k),
                v1080: formatBytes(sizes.v1080),
                v720: formatBytes(sizes.v720),
                a320: formatBytes(sizes.a320),
                a256: formatBytes(sizes.a256),
                a128: formatBytes(sizes.a128)
            },
            debug: {
                stdout: output,
                stderr: errorOutput,
                exit_code: code,
                yt_dlp_command: `${ytDlpPath} ${args.join(' ')}`
            }
          });
        } catch (e) {
          console.error("JSON parse failed, falling back. Output:", output.substring(0, 200));
        }
      }

      // Instead of falling back silently, return the exact failure details to the frontend
      console.log(`[YT-DLP COMMAND] ${ytDlpPath} ${args.join(' ')}`);
      
      // Do not log huge stdout payload to console
      console.log(`[STDOUT LENGTH]`, output.length);
      console.log(`[STDERR]`, errorOutput);
      console.log(`[EXIT CODE]`, code);

      return res.status(500).json({
          success: false,
          actual_error: errorOutput || output || 'Extraction failed with no output',
          stdout: output,
          stderr: errorOutput,
          exit_code: code,
          yt_dlp_command: `${ytDlpPath} ${args.join(' ')}`
      });

      // Dead code: Fallback logic removed as requested by the user to prevent hiding errors
      /*
      if (url.includes('facebook') || url.includes('fb.watch')) {
          try {
              const fb = require('@xaviabot/fb-downloader');
              const result = await fb(url);
              if (result && (result.sd || result.hd)) {
              return sendResponse({
                      title: result.title || "Facebook Video",
                      thumbnail: result.thumbnail || "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=400",
                      duration: null,
                      platform: 'Facebook',
                      sizes: {
                          Original: result.hd ? 'Unknown' : null,
                          v480: result.sd ? 'Unknown' : null
                      }
                  });
              }
          } catch(e) {
              console.log("[Daemon] Xaviabot fallback failed:", e.message);
          }
      }

      // Final fallback to Open Graph
      const proto = url.startsWith('https') ? require('https') : require('http');
      const reqConfig = {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          timeout: 5000
      };
      
      proto.get(url, reqConfig, (ogRes) => {
          let html = '';
          ogRes.on('data', chunk => html += chunk);
          ogRes.on('end', () => {
              const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
              const imgMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
              
              return sendResponse({
                  title: titleMatch ? titleMatch[1] : null,
                  thumbnail: imgMatch ? imgMatch[1].replace(/&amp;/g, '&') : null,
                  duration: null,
                  platform: url.includes('facebook') ? 'Facebook' : url.includes('instagram') ? 'Instagram' : 'Web',
                  sizes: null
              });
          });
      }).on('error', (err) => {
          return res.status(500).json({ error: 'Failed to extract metadata', details: err.message });
      });
      */
    });

  } catch (err) {
    console.error("[Express] /api/metadata crash:", err);
    res.status(500).json({ error: 'Server error' });
  }
});

const jwt = require('jsonwebtoken');

// Helper to determine feature key from url
function getFeatureKeyFromUrl(url) {
    if (url && url.includes('instagram')) return 'instagram_enabled';
    if (url && (url.includes('facebook') || url.includes('fb.watch'))) return 'facebook_enabled';
    return 'youtube_enabled';
}

const checkFeatureAndLimits = (req, res, next) => {
    try {
        const mm = db.prepare("SELECT value_json FROM app_settings WHERE key = 'maintenance_mode'").get();
        if (mm && mm.value_json === 'true') return res.status(503).json({ error: 'System is in maintenance mode' });

        let featureKey = req.body.url ? getFeatureKeyFromUrl(req.body.url) : 'converter_enabled';
        if (req.originalUrl === '/api/convert') featureKey = 'converter_enabled';

        // 1. Global Check
        const globalFlag = db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(featureKey);
        if (globalFlag && globalFlag.value_json === 'false') {
            return res.status(403).json({ error: 'This feature is currently disabled globally by administrators' });
        }

        // Master Subscription Bypass
        const subEnabled = db.prepare('SELECT value_json FROM app_settings WHERE key = "subscription_enabled"').get();
        if (subEnabled && subEnabled.value_json === 'false') {
            return next(); // Bypass all subscription/plan checks
        }

        // 2. Identify User
        let user = null;
        const token = req.cookies ? req.cookies.token : null;
        if (token) {
            try {
                const decoded = jwt.verify(token, auth.JWT_SECRET);
                user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
            } catch(e) {}
        }

        // Check Login Requirement
        const loginRequired = db.prepare("SELECT value_json FROM app_settings WHERE key = 'login_enabled'").get();
        if (loginRequired && loginRequired.value_json === 'true' && !user) {
            return res.status(401).json({ error: 'Login required to use this feature.' });
        }

        if (user) {
            if (user.status === 'suspended') return res.status(403).json({ error: 'Your account is suspended.' });
            if (user.status === 'banned') return res.status(403).json({ error: 'Your account is banned.' });

            // User Override Check
            if (user.feature_toggles_json) {
                try {
                    const toggles = JSON.parse(user.feature_toggles_json);
                    if (toggles[featureKey] === false) {
                        return res.status(403).json({ error: 'This feature has been disabled for your account.' });
                    }
                } catch(e){}
            }

            // Fetch Subscription Limits
            let limits = { daily_downloads: 10, daily_conversions: 5, converter_access: 0 };
            try {
                const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ? AND status IN ("active", "lifetime") AND (expiry_date IS NULL OR expiry_date > CURRENT_TIMESTAMP) ORDER BY start_date DESC LIMIT 1').get(user.id);
                if (sub) {
                    limits = db.prepare('SELECT * FROM plans WHERE id = ?').get(sub.plan_id);
                } else {
                    limits = db.prepare('SELECT * FROM plans WHERE id = "free"').get();
                }
            } catch(e) {}

            // Platform Access Check
            if (featureKey === 'youtube_enabled' && !limits.youtube_enabled) return res.status(403).json({ error: 'YouTube downloads are not available on your current plan.' });
            if (featureKey === 'instagram_enabled' && !limits.instagram_enabled) return res.status(403).json({ error: 'Instagram downloads are not available on your current plan.' });
            if (featureKey === 'facebook_enabled' && !limits.facebook_enabled) return res.status(403).json({ error: 'Facebook downloads are not available on your current plan.' });

            // Format Access Check
            const reqFormat = req.body.format || req.body.ext || (req.body.options && req.body.options.format) || '';
            const isAudio = reqFormat === 'mp3' || reqFormat === 'm4a' || reqFormat === 'audio' || (req.body.options && req.body.options.extractAudio);
            if (isAudio && !limits.mp3_enabled) return res.status(403).json({ error: 'Audio (MP3) downloads are not available on your plan.' });
            if (!isAudio && reqFormat && (reqFormat === 'mp4' || reqFormat === 'video') && !limits.mp4_enabled) return res.status(403).json({ error: 'Video (MP4) downloads are not available on your plan.' });

            // Resolution Check
            const reqQual = req.body.quality || (req.body.options && req.body.options.quality);
            if (reqQual && !isAudio) {
                const q = reqQual.toString().toLowerCase();
                const allowed = limits.max_resolution || '720p';
                
                const resMap = { '360p': 360, '480p': 480, '720p': 720, '1080p': 1080, '1440p': 1440, '4k': 2160, '2160p': 2160, 'best': 2160 };
                const reqResNum = parseInt(q.replace('p', '')) || (q === 'best' ? 2160 : 0);
                const allowedNum = resMap[allowed] || 720;
                
                if (reqResNum > allowedNum && reqResNum > 0) {
                    return res.status(403).json({ error: `Your plan limits you to ${allowed} resolution. Please upgrade to download ${q}.` });
                }
            }

            // Converter Access Check
            if (featureKey === 'converter_enabled' && !limits.converter_access) {
                return res.status(403).json({ error: 'Converter is not available on your current plan. Please upgrade.' });
            }

            const today = new Date().toISOString().split('T')[0] + ' 00:00:00';
            const thisMonth = new Date().toISOString().substring(0, 7) + '-01 00:00:00';

            // Daily & Monthly Limit Check
            if (featureKey !== 'converter_enabled') {
                const limitD = limits.daily_downloads;
                const limitM = limits.monthly_downloads;
                
                if (limitD !== null && limitD !== -1) {
                    const countD = db.prepare('SELECT COUNT(*) as c FROM download_history WHERE user_id = ? AND download_date >= ?').get(user.id, today).c;
                    if (countD >= limitD) return res.status(429).json({ error: `Daily download limit reached (${limitD}). Please wait until tomorrow.` });
                }
                if (limitM !== null && limitM !== -1) {
                    const countM = db.prepare('SELECT COUNT(*) as c FROM download_history WHERE user_id = ? AND download_date >= ?').get(user.id, thisMonth).c;
                    if (countM >= limitM) return res.status(429).json({ error: `Monthly download limit reached (${limitM}). Please upgrade your plan.` });
                }
            } else {
                const limitD = limits.daily_conversions;
                const limitM = limits.monthly_conversions;
                
                if (limitD !== null && limitD !== -1) {
                    const countD = db.prepare('SELECT COUNT(*) as c FROM conversion_history WHERE user_id = ? AND conversion_date >= ?').get(user.id, today).c;
                    if (countD >= limitD) return res.status(429).json({ error: `Daily conversion limit reached (${limitD}). Please wait until tomorrow.` });
                }
                if (limitM !== null && limitM !== -1) {
                    const countM = db.prepare('SELECT COUNT(*) as c FROM conversion_history WHERE user_id = ? AND conversion_date >= ?').get(user.id, thisMonth).c;
                    if (countM >= limitM) return res.status(429).json({ error: `Monthly conversion limit reached (${limitM}). Please upgrade your plan.` });
                }
            }
        }
        
        next();
    } catch(e) {
        console.error("Feature limit check error:", e);
        next();
    }
};

// 2. Start download
app.post('/api/download', checkFeatureAndLimits, (req, res, next) => {
  try {
    const { url, filename, id } = req.body;
    
    console.log(`[Daemon POST /api/download] Input request:`, {
      requestUrl: req.originalUrl,
      body: req.body
    });

    if (!url || !filename || !id) {
      return res.status(400).json({ error: 'Missing url, filename or id parameters' });
    }

    // 1. Verify URL is valid
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (urlErr) {
      return res.status(400).json({
        error: "Invalid Download Endpoint",
        message: "Malformed URL format",
        details: urlErr.message
      });
    }

    // 2. Sanitize filename strictly for Windows
    const format = req.body.format || 'video'; // 'video' or 'audio'
    
    console.log(`Original:`);
    console.log(filename);

    // Extract base and extension
    let baseName = filename.replace(/\.[^/.]+$/, "");
    let extension = filename.includes('.') ? filename.substring(baseName.length) : '';

    // Replace invalid characters: < > : " / \ | ? *
    let sanitizedBase = baseName.replace(/[<>:"\/\\|?*]/g, '_');

    // Trim trailing spaces and dots
    sanitizedBase = sanitizedBase.replace(/[\s.]+$/, '');

    // Windows MAX_PATH limit protection (150 chars for base name)
    if (sanitizedBase.length > 150) {
        sanitizedBase = sanitizedBase.substring(0, 150).replace(/[\s.]+$/, '');
    }

    // Preserve/force extension
    if (format === 'audio') {
      extension = ".mp3";
    } else {
      if (!extension.toLowerCase().endsWith('.mp4')) extension = '.mp4';
    }

    let sanitizedFilename = sanitizedBase + extension;
    
    console.log(`Saved As:`);
    console.log(sanitizedFilename);
    
    const tempDir = path.join(DOWNLOADS_DIR, '.temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const destPath = path.join(tempDir, sanitizedFilename);

    console.log(`[Daemon POST /api/download] Evaluated paths:`, {
      parsedVideoUrl: parsedUrl.href,
      downloadPath: destPath
    });

    // 3. Verify save folder exists
    if (!fs.existsSync(DOWNLOADS_DIR)) {
      try {
        fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
      } catch (mkdirErr) {
        return res.status(500).json({
          error: "Invalid filesystem paths",
          message: "Failed to create Downloads folder",
          details: mkdirErr.message
        });
      }
    }

    // 4. Verify write permissions
    try {
      fs.accessSync(DOWNLOADS_DIR, fs.constants.W_OK);
    } catch (accessErr) {
      return res.status(500).json({
        error: "Permission errors",
        message: "Downloads folder is not writable",
        details: accessErr.message
      });
    }

    // 5. Verify enough disk space (require 10MB minimum)
    try {
      const drive = DOWNLOADS_DIR.substring(0, 1) || 'C';
      const freeSpace = getFreeDiskSpace(drive);
      if (freeSpace < 10 * 1024 * 1024) {
        return res.status(500).json({
          error: "Permission errors",
          message: `Insufficient disk space on drive ${drive}: only ${(freeSpace / (1024 * 1024)).toFixed(1)} MB remaining.`
        });
      }
    } catch (spaceErr) {
      console.warn("Failed to complete disk space verification:", spaceErr.message);
    }

    // 6. Asynchronous extraction & download
    
    // Initialize download record with initial status
    downloads[id] = {
      userToken: req.cookies ? req.cookies.token : null,
      id: id,
      url: url,
      filename: sanitizedFilename,
      path: destPath,
      progress: 0,
      speed: '0 MB/s',
      status: 'downloading', // Frontend expects 'downloading' initially
      loaded: 0,
      contentLength: 0,
      contentType: '',
      error: null,
      debugInfo: {
        originalUrl: url,
        normalizedUrl: url, // Assuming parsedUrl logic is handled in url-parser on frontend
        commandExecuted: '',
        fullOutput: '',
        exitCode: null
      },
      log: [
        `Initial URL: ${url}`,
        `Save location: ${destPath}`
      ]
    };

    // Return immediately to frontend so it doesn't time out
    res.json({
      success: true,
      message: 'Download started',
      filename: sanitizedFilename,
      path: destPath
    });

    // Run the pre-flight check asynchronously
    checkMediaStreamExists(url, async (checkErr, exists) => {
      const isHtmlPageError = checkErr && checkErr.message && checkErr.message.includes('HTML page');
      
      if (checkErr && !isHtmlPageError) {
        downloads[id].status = 'failed';
        downloads[id].error = "Unreachable or invalid media stream URL: " + checkErr.message;
        downloads[id].log.push(`Pre-flight failed: ${checkErr.message}`);
        return;
      }

      if (isHtmlPageError) {
        downloads[id].log.push('Platform HTML page detected. Spawning yt-dlp to download and merge highest quality formats natively...');
        
        const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
        
        // --- PLATFORM DETECTION & SPECIFIC ARGS ---
        const platformArgs = [];
        let targetUrl = url;
        
        if (url.includes('facebook.com') || url.includes('fb.watch')) {
            downloads[id].log.push(`Platform detected as Facebook. Using Xaviabot bypass to fetch direct CDN link...`);
            try {
                const fb = require('@xaviabot/fb-downloader');
                const fbData = await fb(url);
                if (fbData && fbData.hd) {
                    targetUrl = fbData.hd;
                    downloads[id].log.push(`Successfully bypassed Facebook! Extracted HD MP4 link.`);
                } else if (fbData && fbData.sd) {
                    targetUrl = fbData.sd;
                    downloads[id].log.push(`Successfully bypassed Facebook! Extracted SD MP4 link.`);
                } else {
                    downloads[id].log.push(`Warning: Xaviabot did not return a valid MP4 link. Falling back to default engine.`);
                }
            } catch (e) {
                downloads[id].log.push(`Xaviabot bypass failed: ${e.message}. Falling back to default engine.`);
            }
        }

        let ytdlpArgs = [];
        const requestedQuality = req.body.quality || 'Original';
        
        // Helper to check if string looks like an exact format ID (digits and optionally dashes/alphanumerics, not ending with 'p' or 'k' or 'kbps' unless it's a known format_id)
        // More robust: If it doesn't match our old legacy strings, assume it's a format_id.
        const isLegacyAudio = ['320', '256', '192', '128', 'Original'].some(q => requestedQuality.includes(q));
        const isLegacyVideo = ['4k', '1080p', '720p', '480p', '360p', 'Original'].includes(requestedQuality.toLowerCase());

        if (format === 'audio') {
          // Audio Quality mapping
          let audioQualityArg = '0'; // default best
          
          ytdlpArgs = [
            '-v', // Verbose debugging
            ...platformArgs,
            '--no-playlist',
            '--no-warnings',
            '--newline',
            '--extract-audio',
            '--audio-format', 'mp3',
            '--ffmpeg-location', ffmpegPath,
            '-o', destPath
          ];

          if (requestedQuality !== 'Original' && requestedQuality !== 'Best') {
              // If ID is something like "320K" or "640K", use it for audio-quality
              let q = requestedQuality;
              if (q.includes('320') && !q.includes('K')) q = '320K';
              if (q.includes('256') && !q.includes('K')) q = '256K';
              if (q.includes('192') && !q.includes('K')) q = '192K';
              if (q.includes('128') && !q.includes('K')) q = '128K';
              if (q.includes('64') && !q.includes('K') && !q.includes('640')) q = '64K';
              ytdlpArgs.push('--audio-quality', q);
          } else {
              ytdlpArgs.push('--audio-quality', '0'); // Best
          }
          
          ytdlpArgs.push(targetUrl);
          
        } else {
          // Video Quality mapping
          let formatStr = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
          
          if (!isLegacyVideo && requestedQuality !== 'Original') {
              // Use explicit format_id and merge with best audio
              formatStr = `${requestedQuality}+bestaudio[ext=m4a]/best[ext=mp4]/best`;
          } else if (requestedQuality.toLowerCase() === '4k') {
              formatStr = 'bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
          } else if (requestedQuality.toLowerCase() === '1080p') {
              formatStr = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
          } else if (requestedQuality.toLowerCase() === '720p') {
              formatStr = 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
          } else if (requestedQuality.toLowerCase() === '480p') {
              formatStr = 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
          } else if (requestedQuality.toLowerCase() === '360p') {
              formatStr = 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
          }

          ytdlpArgs = [
            '-v', // Verbose debugging
            ...platformArgs,
            '--no-playlist',
            '--no-warnings',
            '--newline',
            '--format', formatStr,
            '--merge-output-format', 'mp4',
            '--ffmpeg-location', ffmpegPath,
            '-o', destPath,
            targetUrl
          ];
        }
        
        const ytdlp = spawn(ytDlpPath, ytdlpArgs);
        
        downloads[id].debugInfo.commandExecuted = `${ytDlpPath} ${ytdlpArgs.join(' ')}`;

        console.log(`\n====================================`);
        console.log(`[DOWNLOAD START] Task ID: ${id}`);
        console.log(`URL: ${url}`);
        console.log(`Format: ${format}, Quality: ${requestedQuality}`);
        console.log(`Dest: ${destPath}`);
        console.log(`[YT-DLP COMMAND] ${ytDlpPath} ${ytdlpArgs.join(' ')}`);
        console.log(`====================================\n`);

        let ytdlpOutputLog = '';
        ytdlp.stdout.on('data', (data) => {
           ytdlpOutputLog += data.toString();
           const lines = data.toString().split('\n');
           for (const line of lines) {
              if (!line.trim()) continue;
              
              if (line.includes('[download]') && line.includes('%')) {
                 // Example: [download]   1.0% of    6.13MiB at    1.94MiB/s ETA 00:03
                 const progressMatch = line.match(/\[download\]\s+([\d\.]+)%\s+of\s+([^\s]+)\s+at\s+([^\s]+)/);
                 if (progressMatch) {
                    downloads[id].progress = parseFloat(progressMatch[1]);
                    downloads[id].speed = progressMatch[3].replace('MiB/s', 'MB/s').replace('KiB/s', 'KB/s');
                    downloads[id].contentLength = progressMatch[2];
                 }
              } else if (line.includes('[Merger]')) {
                 downloads[id].status = 'saving';
                 downloads[id].log.push('Download complete. Merging video and audio tracks (4K support)...');
              }
           }
        });

        let ytdlpErrorLog = '';
        ytdlp.stderr.on('data', (data) => {
           const chunk = data.toString();
           downloads[id].log.push(`yt-dlp: ${chunk.trim()}`);
           ytdlpErrorLog += chunk;
           downloads[id].debugInfo.fullOutput += chunk;
        });

        ytdlp.on('close', (code) => {
           if (code === 0 && fs.existsSync(destPath)) {
              // Final media validation to ensure we didn't just merge a garbage file
              const fd = fs.openSync(destPath, 'r');
              const buf = Buffer.alloc(16);
              fs.readSync(fd, buf, 0, 16, 0);
              fs.closeSync(fd);
              const sniff = sniffMediaBytes(buf);
              
              if (sniff.isMedia === false) {
                 downloads[id].status = 'failed';
                 downloads[id].error = 'Downloaded file failed media validation (HTML/JSON disguised as MP4).';
                 downloads[id].log.push('Validation Failed! Magic bytes do not match expected media signatures.');
                 fs.unlinkSync(destPath);
                 return;
              }
              
              const stats = fs.statSync(destPath);
              if (stats.size === 0) {
                 downloads[id].status = 'failed';
                 downloads[id].error = 'Downloaded file is empty (0 bytes).';
                 downloads[id].log.push('Validation Failed! File is empty.');
                 fs.unlinkSync(destPath);
                 return;
              }
              
              // The file stays in the .temp directory
              downloads[id].path = destPath;
              
              downloads[id].status = 'completed';
              logDownloadIfToken(id);
              downloads[id].progress = 100;
              downloads[id].speed = '0 MB/s';
              console.log(`[Daemon] Download ID ${id} finished successfully via yt-dlp.`);
           } else {
              downloads[id].status = 'failed';
              if (!downloads[id].error) {
                 if (ytdlpErrorLog.includes('cookie database') || ytdlpErrorLog.includes('database is locked')) {
                    downloads[id].error = 'Facebook requires authentication. We tried to read your Microsoft Edge cookies to bypass Chrome locks, but Edge is currently open. Please close Edge or log into Facebook on Edge first.';
                 } else if (ytdlpErrorLog.includes('No module named yt_dlp')) {
                    downloads[id].error = 'yt-dlp is not installed. Run installation command: pip install yt-dlp';
                 } else {
                    let realError = '';
                    const errorLines = ytdlpErrorLog.split('\n');
                    for (const line of errorLines) {
                        if (line.includes('ERROR:')) {
                            realError = line.substring(line.indexOf('ERROR:') + 6).trim();
                            break;
                        }
                    }
                    if (!realError && ytdlpErrorLog.trim().length > 0) {
                        const nonEmpty = errorLines.filter(l => l.trim().length > 0);
                        if (nonEmpty.length > 0) realError = nonEmpty[nonEmpty.length - 1].trim();
                    }
                    if (realError) {
                        downloads[id].error = `yt-dlp error: ${realError}`;
                    } else {
                        downloads[id].error = `Extraction/Download failed (yt-dlp exited with code ${code})`;
                    }
                 }
              }
              console.log(`\n====================================`);
              console.log(`[DOWNLOAD FAILED] Task ID: ${id}`);
              console.log(`Exit Code: ${code}`);
              console.log(`[YT-DLP STDERR]\n${ytdlpErrorLog.trim()}`);
              console.log(`[YT-DLP STDOUT]\n${ytdlpOutputLog.trim()}`);
              console.log(`UI Error Exposed: ${downloads[id].error}`);
              console.log(`====================================\n`);
           }
        });
      } else {
        downloads[id].log.push('Direct media stream confirmed by pre-flight check.');
        console.log(`[Daemon] Pre-flight checks complete. Launching task ID ${id}: ${url} -> ${destPath}`);
        
        // Proceed directly
        downloadMedia(url, destPath, id, (dlErr) => {
          if (dlErr) console.error(`[Daemon] Download ID ${id} failed:`, dlErr.message);
          else console.log(`[Daemon] Download ID ${id} finished successfully.`);
        });
      }
    });

  } catch (err) {
    next(err); // forward to global error handler
  }
});

// Analytics tracking
app.post('/api/track', (req, res) => {
    try {
        const { action, details } = req.body;
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        db.prepare('INSERT INTO activity_logs (admin_id, user_id, action, details, ip_address) VALUES (NULL, NULL, ?, ?, ?)').run(action, details, ip);
        res.json({success: true});
    } catch(e) {
        res.json({success: false});
    }
});

// File Verification Endpoint
app.post('/api/verify-file', (req, res) => {
    try {
        const { path: filePath } = req.body;
        if (!filePath) return res.status(400).json({ success: false, error: 'Path is required' });

        const resolvedPath = path.resolve(filePath);
        if (!resolvedPath.startsWith(DOWNLOADS_DIR)) {
            return res.status(403).json({ success: false, error: 'Access denied: Path outside downloads directory' });
        }

        if (!fs.existsSync(resolvedPath)) {
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            db.prepare('INSERT INTO activity_logs (admin_id, user_id, action, details, ip_address) VALUES (NULL, NULL, ?, ?, ?)').run('Verification Failure', `File missing at ${resolvedPath}`, ip);
            return res.json({ success: false, error: 'File does not exist on disk' });
        }

        try {
            fs.accessSync(resolvedPath, fs.constants.R_OK);
        } catch (accErr) {
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            db.prepare('INSERT INTO activity_logs (admin_id, user_id, action, details, ip_address) VALUES (NULL, NULL, ?, ?, ?)').run('Verification Failure', `Permission denied for ${resolvedPath}`, ip);
            return res.json({ success: false, error: 'Permission denied accessing file' });
        }

        const stats = fs.statSync(resolvedPath);
        if (stats.size === 0) {
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            db.prepare('INSERT INTO activity_logs (admin_id, user_id, action, details, ip_address) VALUES (NULL, NULL, ?, ?, ?)').run('Verification Failure', `0-byte file detected at ${resolvedPath}`, ip);
            return res.json({ success: false, error: 'File is empty (0 bytes)' });
        }

        res.json({ success: true, size: stats.size, path: resolvedPath });
    } catch (e) {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        db.prepare('INSERT INTO activity_logs (admin_id, user_id, action, details, ip_address) VALUES (NULL, NULL, ?, ?, ?)').run('Verification Failure', `Error verifying ${req.body.path}: ${e.message}`, ip);
        res.json({ success: false, error: 'Verification failed: ' + e.message });
    }
});

// Global Error Handler

// ==========================================
// INSTAGRAM & FACEBOOK DOWNLOAD SERVICE
// ==========================================

app.post('/api/social/metadata', async (req, res) => {
    try {
        let { url, type } = req.body;
        if (!url) return res.status(400).json({ error: 'url is required' });

        console.log(`[Daemon POST /api/social/metadata] Fetching metadata for ${type}: ${url}`);

        if (type === 'facebook') {
            try {
                const fb = require('@xaviabot/fb-downloader');
                const fbData = await fb(url);
                if (fbData && (fbData.sd || fbData.hd)) {
                    let vFormats = [];
                    if (fbData.sd) vFormats.push({ format_id: 'sd', resolution: 'SD', qualityLabel: 'SD Quality', filesize: 'Unknown', isAudio: false, url: fbData.sd });
                    if (fbData.hd) vFormats.push({ format_id: 'hd', resolution: 'HD', qualityLabel: 'HD Quality', filesize: 'Unknown', isAudio: false, url: fbData.hd });
                    
                    return res.json({
                        title: fbData.title || 'Facebook Video',
                        thumbnail: fbData.thumbnail || null,
                        duration: null,
                        videoFormats: vFormats,
                        audioFormats: []
                    });
                } else {
                    return res.status(400).json({ error: 'Extraction Failed: No video streams found' });
                }
            } catch (fbErr) {
                return res.status(400).json({ error: 'Extraction Failed: ' + fbErr.message });
            }
        } 
        
        if (type === 'instagram') {
            const args = ['--dump-json', '--no-warnings', '--no-playlist', url];
            const child = spawn(ytDlpPath, args);
            let output = '';
            let errorOutput = '';

            child.stdout.on('data', (data) => { output += data.toString(); });
            child.stderr.on('data', (data) => { errorOutput += data.toString(); });

            child.on('close', (code) => {
                if (code === 0) {
                    try {
                        const lines = output.split('\n');
                        let metadata = null;
                        for (let line of lines) {
                            try {
                                metadata = JSON.parse(line.trim());
                                if (metadata) break;
                            } catch(e) {}
                        }
                        if (!metadata) throw new Error("No valid JSON found in output");
                        
                        let vFormats = [];
                        if (metadata.formats) {
                            const vids = metadata.formats.filter(f => f.vcodec !== 'none' && f.url);
                            if (vids.length > 0) {
                                vids.sort((a,b) => (b.height || 0) - (a.height || 0));
                                vFormats.push({
                                    format_id: vids[0].format_id,
                                    resolution: vids[0].height ? vids[0].height + 'p' : 'Original',
                                    qualityLabel: vids[0].height ? vids[0].height + 'p Original' : 'Original Quality',
                                    filesize: 'Unknown',
                                    isAudio: false,
                                    url: vids[0].url
                                });
                            }
                        }
                        
                        if (vFormats.length === 0 && metadata.url) {
                            vFormats.push({ format_id: 'best', resolution: 'Original', qualityLabel: 'Original Quality', filesize: 'Unknown', isAudio: false, url: metadata.url });
                        }

                        return res.json({
                            title: metadata.title || 'Instagram Media',
                            thumbnail: metadata.thumbnail || null,
                            duration: metadata.duration || null,
                            videoFormats: vFormats,
                            audioFormats: []
                        });
                    } catch (parseErr) {
                        return res.status(500).json({ error: 'Failed to parse JSON from yt-dlp' });
                    }
                } else {
                    console.error("[Daemon] yt-dlp social failed:", errorOutput);
                    let displayErr = 'Extraction Failed';
                    if (errorOutput.includes('empty media response') || errorOutput.includes('logged-in')) displayErr = 'Login Required';
                    if (errorOutput.includes('Unsupported URL')) displayErr = 'Unsupported URL';
                    if (errorOutput.includes('Video unavailable')) displayErr = 'Video Unavailable';
                    
                    return res.status(400).json({ error: displayErr, details: errorOutput });
                }
            });
        }
    } catch (err) {
        console.error("[Express] /api/social/metadata crash:", err);
        return res.status(500).json({ error: "Backend Exception Occurred" });
    }
});

app.post('/api/social/download', checkFeatureAndLimits, async (req, res) => {
    try {
        const { url, filename, id, format_url, format_id, token } = req.body;
        if (!url || !filename || !id) return res.status(400).json({ error: 'Missing parameters' });

        const tempDir = path.join(DOWNLOADS_DIR, '.temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        let baseName = filename.replace(/\.[^/.]+$/, "");
        let extension = filename.includes('.') ? filename.substring(baseName.length) : '.mp4';
        let sanitizedBase = baseName.replace(/[<>:"\/\\|?*]/g, '_');
        if (sanitizedBase.length > 150) sanitizedBase = sanitizedBase.substring(0, 150);
        let sanitizedFilename = sanitizedBase.trim() + extension;
        const destPath = path.join(tempDir, sanitizedFilename);

        console.log(`[Daemon POST /api/social/download] Starting stream to: ${destPath}`);

        downloads[id] = { id, status: 'starting', progress: 0, speed: '0 B/s', path: destPath, url: url };

        if (format_url) {
            const https = require('https');
            try {
                downloads[id].status = 'downloading';
                const file = fs.createWriteStream(destPath);
                
                https.get(format_url, (response) => {
                    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                         // Follow simple redirects manually if needed, or rely on format_url being direct.
                         // Normally Facebook CDN links do not redirect.
                    }
                    const totalLength = response.headers['content-length'];
                    downloads[id].contentLength = parseInt(totalLength) || 0;
                    
                    let downloaded = 0;
                    let lastTime = Date.now();
                    let lastDownloaded = 0;

                    response.on('data', (chunk) => {
                        downloaded += chunk.length;
                        downloads[id].loaded = downloaded;
                        if (totalLength) {
                            downloads[id].progress = (downloaded / totalLength) * 100;
                        } else {
                            downloads[id].progress = 50; 
                        }
                        
                        const now = Date.now();
                        if (now - lastTime >= 1000) {
                            const speed = ((downloaded - lastDownloaded) / ((now - lastTime) / 1000)) / (1024 * 1024);
                            downloads[id].speed = `${speed.toFixed(2)} MB/s`;
                            lastTime = now;
                            lastDownloaded = downloaded;
                        }
                    });

                    response.pipe(file);

                    file.on('finish', () => {
                        file.close(() => {
                            downloads[id].status = 'completed';
                            logDownloadIfToken(id);
                            downloads[id].progress = 100;
                            console.log(`[Daemon] Social Download ID ${id} finished successfully.`);
                        });
                    });
                }).on('error', (err) => {
                    fs.unlink(destPath, () => {});
                    downloads[id].status = 'failed';
                    downloads[id].error = err.message;
                });
                
                return res.json({ success: true, message: 'Social download started', id });

            } catch (streamErr) {
                downloads[id].status = 'failed';
                downloads[id].error = 'Stream failed: ' + streamErr.message;
                return res.status(500).json({ error: 'Stream failed' });
            }
        } else {
            const spawnArgs = ['--newline', '--no-playlist', '--ffmpeg-location', globalFfmpegPath, '-o', destPath, url];
            const ytchild = spawn(ytDlpPath, spawnArgs);
            downloads[id].status = 'downloading';
            
            console.log(`\n====================================`);
            console.log(`[DOWNLOAD START] Fallback Task ID: ${id}`);
            console.log(`URL: ${url}`);
            console.log(`Dest: ${destPath}`);
            console.log(`[YT-DLP COMMAND] yt-dlp ${spawnArgs.join(' ')}`);
            console.log(`====================================\n`);
            
            let ytchildErrorLog = '';
            ytchild.stderr.on('data', (data) => {
                ytchildErrorLog += data.toString();
            });

            let ytchildOutputLog = '';
            ytchild.stdout.on('data', (data) => {
                ytchildOutputLog += data.toString();
                const lines = data.toString().split('\n');
                lines.forEach(line => {
                    if (line.includes('%')) {
                        const match = line.match(/(\d+\.?\d*)%/);
                        if (match) downloads[id].progress = parseFloat(match[1]);
                        const speedMatch = line.match(/at\s+(\d+\.?\d*[KMG]iB\/s)/);
                        if (speedMatch) downloads[id].speed = speedMatch[1].replace('iB', 'B');
                    }
                });
            });
            
            ytchild.on('close', (code) => {
                if (code === 0 && fs.existsSync(destPath)) {
                    const stats = fs.statSync(destPath);
                    if (stats.size > 0) {
                        // The file stays in the .temp directory
                        downloads[id].path = destPath;
                        downloads[id].status = 'completed';
                        logDownloadIfToken(id);
                        downloads[id].progress = 100;
                    } else {
                        downloads[id].status = 'failed';
                        downloads[id].error = 'Download failed (file is empty)';
                        fs.unlinkSync(destPath);
                    }
                } else {
                    downloads[id].status = 'failed';
                    let realError = '';
                    const errorLines = ytchildErrorLog.split('\n');
                    for (const line of errorLines) {
                        if (line.includes('ERROR:')) {
                            realError = line.substring(line.indexOf('ERROR:') + 6).trim();
                            break;
                        }
                    }
                    if (!realError && ytchildErrorLog.trim().length > 0) {
                        const nonEmpty = errorLines.filter(l => l.trim().length > 0);
                        if (nonEmpty.length > 0) realError = nonEmpty[nonEmpty.length - 1].trim();
                    }
                    if (realError) {
                        downloads[id].error = `yt-dlp error: ${realError}`;
                    } else {
                        downloads[id].error = `Download failed (Code ${code})`;
                    }
                }
                
                if (downloads[id].status === 'failed') {
                    console.log(`\n====================================`);
                    console.log(`[DOWNLOAD FAILED] Fallback Task ID: ${id}`);
                    console.log(`Exit Code: ${code}`);
                    console.log(`[YT-DLP STDERR]\n${ytchildErrorLog.trim()}`);
                    console.log(`[YT-DLP STDOUT]\n${ytchildOutputLog.trim()}`);
                    console.log(`UI Error Exposed: ${downloads[id].error}`);
                    console.log(`====================================\n`);
                }
            });
            return res.json({ success: true, message: 'Social fallback download started', id });
        }
    } catch (err) {
        console.error("[Express] /api/social/download crash:", err);
        return res.status(500).json({ error: "Backend Exception Occurred" });
    }
});

// 3. Download status

app.get('/api/fetch-file', (req, res) => {
    const { id } = req.query;
    if (!id || !downloads[id] || !downloads[id].path) {
        return res.status(404).send('File not found or expired.');
    }
    
    const filePath = downloads[id].path;
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File no longer exists on server.');
    }
    
    const filename = path.basename(filePath);
    res.download(filePath, filename, (err) => {
        if (err) {
            console.error('[Download Streaming Error]:', err.message);
        }
        // Delete the temporary file from the server after streaming it to the user
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`[Cleanup] Deleted streamed file: ${filePath}`);
            }
        } catch(e) {
            console.error('[Cleanup Error]:', e.message);
        }
    });
});

app.get('/api/download-status', (req, res) => {
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Download ID is required' });
  }

  const item = downloads[id];
  if (!item) {
    return res.status(404).json({ error: 'Download record not found' });
  }

  return res.json({
    progress: item.progress,
    speed: item.speed,
    status: item.status,
    error: item.error,
    path: item.path,
    loaded: item.loaded,
    contentLength: item.contentLength,
    contentType: item.contentType,
    log: item.log
  });
});

// 4. Pause download
app.post('/api/download-pause', (req, res) => {
  const { id } = req.body;
  if (downloads[id]) {
    downloads[id].status = 'paused';
    downloads[id].log.push('Download paused by user');
    return res.json({ success: true });
  }
  return res.status(404).json({ error: 'Download not found' });
});

// 5. Cancel/Delete download
app.post('/api/download-cancel', (req, res) => {
  const { id } = req.body;
  if (downloads[id]) {
    downloads[id].status = 'cancelled';
    downloads[id].log.push('Download cancelled by user');
    const destPath = downloads[id].path;
    if (fs.existsSync(destPath)) {
      try {
        fs.unlinkSync(destPath);
      } catch (e) {
        console.error("Cleanup error:", e);
      }
    }
    return res.json({ success: true });
  }
  return res.status(404).json({ error: 'Download not found' });
});

// 6. Open Saved File
app.post('/api/open-file', (req, res) => {
  const filePath = req.body.path;
  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }

  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(DOWNLOADS_DIR)) {
    return res.status(403).json({ error: 'Access denied outside Downloads directory' });
  }

  if (!fs.existsSync(resolvedPath)) {
    return res.status(404).json({ error: 'File does not exist' });
  }

  exec(`start "" "${resolvedPath}"`, (err) => {
    if (err) {
      console.error(`Failed to launch file: ${err.message}`);
      return res.status(500).json({ error: `Failed to open file: ${err.message}` });
    }
    return res.json({ success: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONVERTER API ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

const multer = require('multer');
const fluentFfmpeg = require('fluent-ffmpeg');

// Set up fluent-ffmpeg with the installed ffmpeg binary
try {
  fluentFfmpeg.setFfmpegPath(require('@ffmpeg-installer/ffmpeg').path);
} catch(e) {
  console.error('[Daemon] Warning: @ffmpeg-installer/ffmpeg not found. Assuming ffmpeg is in PATH.');
}

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const uploadStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.]/g, '_'));
    }
});
const upload = multer({ storage: uploadStorage });
const convertQueue = new Map();

function logConvertIfToken(id) {
    const job = convertQueue.get(id);
    if (job && job.userToken) {
        if (auth && auth.logConversionWithToken) auth.logConversionWithToken(job.userToken, job.type || 'Conversion', job.originalName, job.outputPath);
    }
}

// Public Settings API
app.get('/api/public-settings', (req, res) => {
    try {
        const ads = db.prepare('SELECT value_json FROM app_settings WHERE key = "ads_enabled"').get();
        const mm = db.prepare('SELECT value_json FROM app_settings WHERE key = "maintenance_mode"').get();
        const le = db.prepare('SELECT value_json FROM app_settings WHERE key = "login_enabled"').get();
        
        const se = db.prepare('SELECT value_json FROM app_settings WHERE key = "subscription_enabled"').get();
        const ppe = db.prepare('SELECT value_json FROM app_settings WHERE key = "plan_premium_enabled"').get();
        const ppro = db.prepare('SELECT value_json FROM app_settings WHERE key = "plan_pro_enabled"').get();
        const plife = db.prepare('SELECT value_json FROM app_settings WHERE key = "plan_lifetime_enabled"').get();
        
        const rAds = db.prepare('SELECT value_json FROM app_settings WHERE key = "rewarded_ads_enabled"').get();
        const rAdCool = db.prepare('SELECT value_json FROM app_settings WHERE key = "rewarded_ad_cooldown_mins"').get();
        const rAdFreq = db.prepare('SELECT value_json FROM app_settings WHERE key = "rewarded_ad_frequency_downloads"').get();

        let placements = {};
        try {
            const rows = db.prepare('SELECT id, code, is_enabled FROM ad_placements').all();
            rows.forEach(r => placements[r.id] = { code: r.code, enabled: r.is_enabled });
        } catch(e) {} // Table might not exist if migration just ran without restart
        
        res.json({
            success: true,
            ads_enabled: ads ? ads.value_json === 'true' : true,
            maintenance_mode: mm ? mm.value_json === 'true' : false,
            login_enabled: le ? le.value_json === 'true' : false,
            subscription_enabled: se ? se.value_json === 'true' : false,
            plan_premium_enabled: ppe ? ppe.value_json === 'true' : true,
            plan_pro_enabled: ppro ? ppro.value_json === 'true' : true,
            plan_lifetime_enabled: plife ? plife.value_json === 'true' : true,
            rewarded_ads_enabled: rAds ? rAds.value_json === 'true' : true,
            rewarded_ad_cooldown_mins: rAdCool ? parseInt(rAdCool.value_json) || 15 : 15,
            rewarded_ad_frequency_downloads: rAdFreq ? parseInt(rAdFreq.value_json) || 3 : 3,
            ad_placements: placements
        });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// File Upload Endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    return res.json({ success: true, filePath: req.file.path, originalName: req.file.originalname });
});

// Start Conversion Endpoint
app.post('/api/convert', checkFeatureAndLimits, (req, res) => {
    const { id, inputPath, originalName, type, formatConfig } = req.body;
    if (!id || !inputPath || !type || !fs.existsSync(inputPath)) {
        return res.status(400).json({ error: 'Invalid conversion request or file missing' });
    }

    const ext = (type === 'MP4_TO_MP3' || type === 'MP3_TO_MP3') ? '.mp3' : '.mp4';
    const outName = `Converted_${Date.now()}_${originalName.replace(/\.[^/.]+$/, "")}${ext}`;
    
    const tempDir = path.join(DOWNLOADS_DIR, '.temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const outputPath = path.join(tempDir, outName);
    
    let command = fluentFfmpeg(inputPath);
    
    if (type === 'MP4_TO_MP3' || type === 'MP3_TO_MP3') {
        const bitrate = formatConfig?.bitrate || '192k';
        command = command.audioBitrate(bitrate);
        
        if (type === 'MP3_TO_MP3') {
            const filters = [];
            if (formatConfig?.normalize) filters.push('loudnorm');
            if (formatConfig?.removeSilence) filters.push('silenceremove=stop_periods=-1:stop_duration=1:stop_threshold=-50dB');
            if (filters.length > 0) command.audioFilters(filters);
        }
    } else if (type === 'MP4_TO_MP4') {
        if (formatConfig?.resolution) {
            const resMap = { '4K': '3840x2160', '1080P': '1920x1080', '720P': '1280x720', '480P': '854x480' };
            if (resMap[formatConfig.resolution]) command = command.size(resMap[formatConfig.resolution]);
        }
        if (formatConfig?.compression) {
            const crfMap = { 'High Quality': 18, 'Balanced': 23, 'Small File': 28 };
            const crf = crfMap[formatConfig.compression] || 23;
            command = command.outputOptions([`-crf ${crf}`, '-preset medium']);
        }
    }

    command.save(outputPath);

    convertQueue.set(id, {
        userToken: req.cookies ? req.cookies.token : null,
        type,
        id, originalName, status: 'Converting', progress: 0, command, outputPath, inputPath
    });

    command.on('progress', (progress) => {
        const job = convertQueue.get(id);
        if (job) job.progress = progress.percent || 0;
    }).on('end', () => {
        const job = convertQueue.get(id);
        if (job) {
            if (fs.existsSync(job.outputPath)) {
                const stats = fs.statSync(job.outputPath);
                if (stats.size > 0) {
                    const finalPath = getFinalDestPath(path.basename(job.outputPath), 'Converted');
                    try {
                        fs.renameSync(job.outputPath, finalPath);
                        job.outputPath = finalPath;
                        console.log(`[Validation] Moved converted file to final destination: ${finalPath}`);
                    } catch (e) {
                        console.error("Failed to move converted file: ", e);
                    }
                    job.status = 'Completed';
                    logConvertIfToken(id);
                    job.progress = 100;
                } else {
                    job.status = 'Error';
                    job.error = 'Converted file is empty (0 bytes).';
                    fs.unlinkSync(job.outputPath);
                }
            } else {
                job.status = 'Error';
                job.error = 'Converted file not found on disk.';
            }
        }
    }).on('error', (err) => {
        const job = convertQueue.get(id);
        if (job && job.status !== 'Cancelled') {
            job.status = 'Error';
            job.error = err.message;
        }
    });

    return res.json({ success: true, id, outputPath });
});

// Queue Status Endpoint
app.get('/api/queue', (req, res) => {
    const queueData = Array.from(convertQueue.values()).map(j => {
        let fileExists = false;
        let fileSize = 0;
        if (j.status === 'Completed' && j.outputPath) {
            try {
                const stats = fs.statSync(j.outputPath);
                fileExists = true;
                fileSize = stats.size;
            } catch(e) {}
        }
        return {
            id: j.id, originalName: j.originalName, status: j.status, progress: j.progress, outputPath: j.outputPath, error: j.error, fileExists, fileSize
        };
    });
    return res.json({ queue: queueData });
});

// Download Endpoint
app.get('/api/converter/download', (req, res) => {
    const { id } = req.query;
    const job = convertQueue.get(id);
    if (!job || !job.outputPath || !fs.existsSync(job.outputPath)) {
        return res.status(404).json({ error: 'File not found' });
    }
    return res.download(job.outputPath);
});

// Save As Dialog Endpoint
// Bypass Native Save Dialog - Direct Browser Download Endpoint
app.get('/api/serve-file', (req, res) => {
    try {
        const { path: filePath, filename } = req.query;
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).send('Source file not found');
        }
        
        // Use Express's built-in res.download to handle streaming and headers
        res.download(filePath, filename || path.basename(filePath), (err) => {
            if (!err) {
                // Automatically clean up the .temp file after it has been fully transmitted to the browser
                try {
                    if (filePath.includes('.temp') || filePath.includes('.streamvault')) {
                        fs.unlinkSync(filePath);
                    }
                } catch(e) {
                    console.error("Cleanup failed:", e);
                }
            }
        });
    } catch(err) {
        res.status(500).send('Internal Server Error');
    }
});

// Queue Actions (Cancel)
app.post('/api/queue/action', (req, res) => {
    const { id, action } = req.body;
    const job = convertQueue.get(id);
    if (!job || !job.command) return res.status(404).json({ error: 'Job not found' });
    
    try {
        if (action === 'cancel') {
            job.command.kill('SIGKILL');
            job.status = 'Cancelled';
        }
        return res.json({ success: true });
    } catch(e) {
        return res.status(500).json({ error: e.message });
    }
});

// 7. Open Folder
app.post('/api/open-folder', (req, res) => {
  // This is a desktop-only feature — not applicable on server deployments
  if (process.platform !== 'win32') {
    return res.json({ success: true, message: 'Open folder not supported on server deployments.' });
  }

  const filePath = req.body.path;
  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }

  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(DOWNLOADS_DIR)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (fs.existsSync(resolvedPath)) {
    exec(`explorer.exe /select,"${resolvedPath}"`, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      return res.json({ success: true });
    });
  } else {
    exec(`explorer.exe "${DOWNLOADS_DIR}"`, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      return res.json({ success: true });
    });
  }
});

// ==========================================
// Release Management System (User Routes)
// ==========================================

function requireAuth(req, res, next) {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, auth.JWT_SECRET);
        req.user = decoded;
        next();
    } catch(e) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

// Submit Feedback
app.post('/api/user/feedback', requireAuth, (req, res) => {
    try {
        const { rating, type, message } = req.body;
        const id = crypto.randomUUID();
        db.prepare('INSERT INTO user_feedback (id, user_id, rating, type, message) VALUES (?, ?, ?, ?, ?)').run(id, req.user.id, rating, type, message);
        res.json({ success: true, message: 'Feedback submitted successfully' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Support Tickets
app.post('/api/user/tickets', requireAuth, (req, res) => {
    try {
        const { type, description } = req.body;
        db.prepare('INSERT INTO support_tickets (user_id, type, description) VALUES (?, ?, ?)').run(req.user.id, type, description);
        res.json({ success: true, message: 'Support ticket opened' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/user/tickets', requireAuth, (req, res) => {
    try {
        const tickets = db.prepare('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
        res.json({ success: true, tickets });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// App Status (Release Version, Force Update, Maintenance)
app.get('/api/app/status', (req, res) => {
    try {
        const release = db.prepare('SELECT * FROM app_releases WHERE is_current = 1').get();
        const settingsRaw = db.prepare("SELECT value_json FROM app_settings WHERE key = 'maintenance_mode'").get();
        const maintenance_mode = settingsRaw ? settingsRaw.value_json === 'true' : false;

        res.json({
            success: true,
            version: release ? release.version : 'v1.0.0',
            release_notes: release ? release.release_notes : '',
            force_update: release ? (release.force_update === 1) : false,
            maintenance_mode
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Global Express Exception Error-Handling Middleware
app.use((err, req, res, next) => {
  console.error("[Global Exception Stack Trace]:\n", err.stack);
  return res.status(500).json({
    error: "Internal Server Error",
    message: err.message,
    stack: err.stack,
    diagnostics: {
      requestUrl: req.originalUrl,
      method: req.method,
      body: req.body,
      timestamp: new Date().toISOString()
    }
  });
});

// AUTO DIAGNOSTICS ENDPOINT
app.get('/api/system-check', (req, res) => {
    const { execSync } = require('child_process');
    let pyVersion = 'Not installed', ytdlpVersion = 'Not installed', ffmpegVersion = 'Not installed';
    
    try { pyVersion = execSync('python --version', {stdio: 'pipe'}).toString().trim(); } catch(e){}
    try { ytdlpVersion = execSync('python -m yt_dlp --version', {stdio: 'pipe'}).toString().trim(); } catch(e){}
    try { ffmpegVersion = execSync('"' + require('@ffmpeg-installer/ffmpeg').path + '" -version', {stdio: 'pipe'}).toString().split('\n')[0].trim(); } catch(e){}

    const status = (pyVersion !== 'Not installed' && ytdlpVersion !== 'Not installed' && ffmpegVersion !== 'Not installed') ? 'OK' : 'DEGRADED';
    
    res.json({ python: pyVersion, yt_dlp: ytdlpVersion, ffmpeg: ffmpegVersion, status });
});

// Start listening
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Daemon] Local service listening on http://127.0.0.1:`);
  
  const { execSync } = require('child_process');
  console.log('\n[STARTUP CHECK] Verifying Python Environment...');
  
  try {
      execSync('python --version', {stdio: 'pipe'});
      console.log('✓ Python is installed.');
  } catch(e) {
      console.error('❌ ERROR: Python is not installed or not in PATH.');
  }
  
  try {
      execSync('python -c "import yt_dlp"', {stdio: 'pipe'});
      console.log('✓ yt-dlp module is installed.');
  } catch(e) {
      console.error('❌ ERROR: yt-dlp is not installed. Run installation command: pip install yt-dlp');
  }
  
  try {
      execSync('"' + require('@ffmpeg-installer/ffmpeg').path + '" -version', {stdio: 'pipe'});
      console.log('✓ Local ffmpeg binary is installed.');
  } catch(e) {
      console.error('❌ ERROR: Local ffmpeg binary is missing.');
  }
  console.log('------------------------------------------------\n');
});

// ─────────────────────────────────────────────────────────────────────────────
// CRON: ORPHAN FILE CLEANUP
// ─────────────────────────────────────────────────────────────────────────────
// Delete temporary files older than 1 hour to prevent disk exhaustion
setInterval(() => {
    const tempDir = path.join(DOWNLOADS_DIR, '.temp');
    if (!fs.existsSync(tempDir)) return;
    
    fs.readdir(tempDir, (err, files) => {
        if (err) return console.error("[Cron] Failed to read temp directory:", err);
        
        const now = Date.now();
        files.forEach(file => {
            const filePath = path.join(tempDir, file);
            fs.stat(filePath, (statErr, stats) => {
                if (statErr) return;
                
                // If file is older than 1 hour (3,600,000 ms), delete it
                if (now - stats.mtimeMs > 3600000) {
                    fs.unlink(filePath, (unlinkErr) => {
                        if (!unlinkErr) {
                            console.log(`[Cron] Deleted orphan temp file: ${file}`);
                        }
                    });
                }
            });
        });
    });
}, 15 * 60 * 1000); // Runs every 15 minutes

// ─── TEMP DIRECTORY CLEANUP SERVICE ─────────────────────────────────────────
// Runs every 15 minutes to delete orphan files older than 1 hour
setInterval(() => {
    const tempDir = path.join(DOWNLOADS_DIR, '.temp');
    if (!fs.existsSync(tempDir)) return;
    
    fs.readdir(tempDir, (err, files) => {
        if (err) return console.error('[Cleanup Service] Read error:', err.message);
        
        const now = Date.now();
        const ONE_HOUR = 60 * 60 * 1000;
        let deletedCount = 0;
        
        files.forEach(file => {
            const filePath = path.join(tempDir, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                if (now - stats.mtimeMs > ONE_HOUR) {
                    try {
                        fs.unlinkSync(filePath);
                        deletedCount++;
                    } catch(e) {}
                }
            });
        });
        
        if (deletedCount > 0) {
            console.log(`[Cleanup Service] Purged ${deletedCount} orphan files from .temp folder.`);
        }
    });
    
    // Also clean up old memory downloads
    const now = Date.now();
    for (const [id, data] of Object.entries(downloads)) {
        // If download is completed/failed/cancelled and older than 2 hours, delete from memory
        // Wait, we don't store timestamp in downloads object easily, but we can just use size heuristics or ignore for now.
    }
}, 15 * 60 * 1000);
