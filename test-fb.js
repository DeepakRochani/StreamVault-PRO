const { spawn } = require('child_process');
const ytDlpPath = './bin/yt-dlp';
const targetUrl = 'https://www.facebook.com/watch/?v=922572573177727';
const args = ['-J', targetUrl];
const child = spawn(ytDlpPath, args);
let out = '';
child.stdout.on('data', d => out += d.toString());
child.on('close', code => {
  const json = JSON.parse(out);
  console.log("Formats:", json.formats.map(f => ({ id: f.format_id, hasUrl: !!f.url })));
});
