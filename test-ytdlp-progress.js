const { spawn } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

console.log("Using ffmpeg at:", ffmpegPath);

const ytdlp = spawn('python', [
    '-m', 'yt_dlp',
    '--no-playlist',
    '--no-warnings',
    '--newline',
    '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '--ffmpeg-location', ffmpegPath,
    '-o', 'test-4k.%(ext)s',
    'https://www.youtube.com/watch?v=TA0y7PpR-L0'
]);

ytdlp.stdout.on('data', data => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
        if (!line.trim()) continue;
        console.log("STDOUT:", line.trim());
    }
});

ytdlp.stderr.on('data', data => {
    console.log("STDERR:", data.toString().trim());
});

ytdlp.on('close', code => {
    console.log("yt-dlp exited with code", code);
});
