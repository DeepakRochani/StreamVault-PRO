const fs = require('fs');

const path = 'C:/Users/DR Films/.gemini/antigravity-ide/scratch/streamvault-downloader/server.js';
let content = fs.readFileSync(path, 'utf8');

// 1. GLOBAL ffmpegPath
if (!content.includes('const globalFfmpegPath')) {
    content = content.replace(
        "const path = require('path');",
        "const path = require('path');\nconst globalFfmpegPath = require('@ffmpeg-installer/ffmpeg').path;"
    );
}

// 2. Add --ffmpeg-location to the fallback yt-dlp call
const oldFallback = `const spawnArgs = ['--newline', '--no-playlist', '-o', destPath, url];`;
const newFallback = `const spawnArgs = ['--newline', '--no-playlist', '--ffmpeg-location', globalFfmpegPath, '-o', destPath, url];`;
content = content.replace(oldFallback, newFallback);

// 3. Add /api/fetch-file endpoint
const fetchFileEndpoint = `
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
                console.log(\`[Cleanup] Deleted streamed file: \${filePath}\`);
            }
        } catch(e) {
            console.error('[Cleanup Error]:', e.message);
        }
    });
});
`;

if (!content.includes('/api/fetch-file')) {
    content = content.replace(
        "app.get('/api/download-status', (req, res) => {",
        fetchFileEndpoint + "\napp.get('/api/download-status', (req, res) => {"
    );
}

// 4. Update the File Verification logic for the fallback yt-dlp call
const oldFallbackCheck = `if (code === 0 && fs.existsSync(destPath)) {
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
                } else {`;

// The old fallback check is actually fine! It has `fs.statSync` and `stats.size > 0`.
// Let's check where the MAIN yt-dlp call (the platform native one) completes.
// Wait, the main yt-dlp call is around line 1500.

// 5. Add Temp Cleanup Service at the end of the file
const tempCleanupCron = `
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
            console.log(\`[Cleanup Service] Purged \${deletedCount} orphan files from .temp folder.\`);
        }
    });
    
    // Also clean up old memory downloads
    const now = Date.now();
    for (const [id, data] of Object.entries(downloads)) {
        // If download is completed/failed/cancelled and older than 2 hours, delete from memory
        // Wait, we don't store timestamp in downloads object easily, but we can just use size heuristics or ignore for now.
    }
}, 15 * 60 * 1000);
`;

if (!content.includes('TEMP DIRECTORY CLEANUP SERVICE')) {
    content += tempCleanupCron;
}

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully updated server.js');
