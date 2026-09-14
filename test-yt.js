const { spawn } = require('child_process');
const path = require('path');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ytDlpPath = './bin/yt-dlp';

const targetUrl = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // Me at the zoo (short video)
const destPath = 'test_download_yt.mp4';
const formatStr = 'bestvideo[height<=720][vcodec^=avc]+bestaudio[ext=m4a]/bestvideo+bestaudio/best';

const ytdlpArgs = [
    '-v',
    '--no-playlist',
    '--newline',
    '--no-update',
    '--format', formatStr,
    '--remux-video', 'mp4',
    '--ffmpeg-location', ffmpegPath,
    '-o', destPath,
    targetUrl
];

console.log("Running:", ytDlpPath, ytdlpArgs.join(' '));

const yt = spawn(ytDlpPath, ytdlpArgs);

yt.stdout.on('data', data => process.stdout.write(data));
yt.stderr.on('data', data => process.stderr.write(data));
yt.on('close', code => console.log('Exited with', code));
