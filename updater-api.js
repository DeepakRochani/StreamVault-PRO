const express = require('express');
const router = express.Router();
const db = require('./database.js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');

// Global download state
const downloadState = {
    active: false,
    progress: 0,
    speedMBps: 0,
    remainingSeconds: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    filePath: null
};

router.get('/check', (req, res) => {
    try {
        const clientVersion = req.query.currentVersion || 'v0.0.0';
        const platform = req.query.platform || 'win';
        
        const latest = db.prepare('SELECT * FROM app_releases WHERE is_current = 1 LIMIT 1').get();
        if (!latest) {
            return res.json({ updateAvailable: false });
        }

        const isNewer = latest.version !== clientVersion; // Basic check. In prod, semver comparison.
        
        res.json({
            updateAvailable: isNewer,
            version: latest.version,
            releaseNotes: latest.release_notes,
            forceUpdate: latest.force_update,
            minRequiredVersion: latest.min_required_version,
            downloadUrl: platform === 'mac' ? latest.mac_url : platform === 'android' ? latest.android_url : platform === 'ios' ? latest.ios_url : latest.win_url
        });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/download', (req, res) => {
    const { url, platform } = req.body;
    if (!url) return res.status(400).json({ error: 'No URL provided' });
    
    if (downloadState.active) {
        return res.status(400).json({ error: 'Download already in progress' });
    }

    const ext = platform === 'mac' ? '.dmg' : platform === 'android' ? '.apk' : platform === 'ios' ? '.ipa' : '.exe';
    const tempDir = path.join(require('os').tmpdir(), 'streamvault_updates');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const filePath = path.join(tempDir, `update_${Date.now()}${ext}`);
    const fileStream = fs.createWriteStream(filePath);
    
    downloadState.active = true;
    downloadState.progress = 0;
    downloadState.downloadedBytes = 0;
    downloadState.totalBytes = 0;
    downloadState.speedMBps = 0;
    downloadState.remainingSeconds = 0;
    downloadState.filePath = filePath;

    const protocol = url.startsWith('https') ? https : http;
    const startTime = Date.now();
    let lastBytes = 0;
    let lastTime = startTime;

    protocol.get(url, (response) => {
        if (response.statusCode !== 200) {
            downloadState.active = false;
            return res.status(500).json({ error: `Failed to download. Status: ${response.statusCode}` });
        }

        downloadState.totalBytes = parseInt(response.headers['content-length'], 10) || 0;
        
        res.json({ success: true, message: 'Download started' });

        response.on('data', (chunk) => {
            downloadState.downloadedBytes += chunk.length;
            if (downloadState.totalBytes > 0) {
                downloadState.progress = Math.round((downloadState.downloadedBytes / downloadState.totalBytes) * 100);
            }
            
            const now = Date.now();
            const timeDiff = (now - lastTime) / 1000;
            if (timeDiff >= 1) { // Calculate speed every second
                const bytesDiff = downloadState.downloadedBytes - lastBytes;
                downloadState.speedMBps = (bytesDiff / (1024 * 1024) / timeDiff).toFixed(2);
                if (bytesDiff > 0 && downloadState.totalBytes > 0) {
                    const remainingBytes = downloadState.totalBytes - downloadState.downloadedBytes;
                    downloadState.remainingSeconds = Math.round(remainingBytes / (bytesDiff / timeDiff));
                }
                lastBytes = downloadState.downloadedBytes;
                lastTime = now;
            }
        });

        response.pipe(fileStream);

        fileStream.on('finish', () => {
            fileStream.close();
            downloadState.progress = 100;
            downloadState.active = false;
        });

    }).on('error', (err) => {
        fs.unlink(filePath, () => {});
        downloadState.active = false;
        if (!res.headersSent) res.status(500).json({ error: err.message });
    });
});

router.get('/progress', (req, res) => {
    res.json(downloadState);
});

router.post('/install', (req, res) => {
    if (!downloadState.filePath || !fs.existsSync(downloadState.filePath)) {
        return res.status(400).json({ error: 'No downloaded update found' });
    }

    const filePath = downloadState.filePath;
    const ext = path.extname(filePath).toLowerCase();

    res.json({ success: true, message: 'Initiating installation and restarting...' });

    // Execute in detached process
    setTimeout(() => {
        try {
            if (ext === '.exe') {
                spawn('cmd.exe', ['/c', 'start', '""', filePath, '/silent'], { detached: true, stdio: 'ignore' }).unref();
            } else if (ext === '.dmg') {
                spawn('hdiutil', ['attach', filePath], { detached: true, stdio: 'ignore' }).unref();
            }
            // Shut down daemon to allow update to replace files
            console.log("Shutting down daemon for auto-update...");
            process.exit(0);
        } catch (e) {
            console.error("Install failed:", e);
        }
    }, 1000);
});

module.exports = router;
