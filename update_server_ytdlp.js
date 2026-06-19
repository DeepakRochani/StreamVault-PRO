const fs = require('fs');
const filePath = 'C:/Users/DR Films/.gemini/antigravity-ide/scratch/streamvault-downloader/server.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update FFMPEG Path for asar.unpacked
const oldFfmpeg = `const globalFfmpegPath = require('@ffmpeg-installer/ffmpeg').path;`;
const newFfmpeg = `let globalFfmpegPath = require('@ffmpeg-installer/ffmpeg').path;
if (globalFfmpegPath.includes('app.asar')) {
    globalFfmpegPath = globalFfmpegPath.replace('app.asar', 'app.asar.unpacked');
}`;
if (content.includes(oldFfmpeg)) {
    content = content.replace(oldFfmpeg, newFfmpeg);
}

// 2. Add yt-dlp path resolver
const ytDlpResolver = `
// Resolve local yt-dlp.exe if packaged in Electron
let ytDlpPath = path.join(__dirname, 'bin', 'yt-dlp.exe');
if (ytDlpPath.includes('app.asar')) {
    ytDlpPath = ytDlpPath.replace('app.asar', 'app.asar.unpacked');
}
if (!fs.existsSync(ytDlpPath)) {
    ytDlpPath = 'yt-dlp'; // fallback
}
`;

if (!content.includes('let ytDlpPath')) {
    content = content.replace("const app = express();", ytDlpResolver + "\nconst app = express();");
}

// 3. Replace all spawn('yt-dlp') with spawn(ytDlpPath)
content = content.replace(/spawn\('yt-dlp'/g, "spawn(ytDlpPath");

fs.writeFileSync(filePath, content, 'utf8');
console.log('Updated server.js to use bundled binaries');
