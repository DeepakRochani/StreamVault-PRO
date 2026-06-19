const fs = require('fs');
const path = 'C:/Users/DR Films/.gemini/antigravity-ide/scratch/streamvault-downloader/package.json';
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));

pkg.build.files = [
  "dist/**/*",
  "main.js",
  "preload.js",
  "server.js",
  "auth.js",
  "admin.js",
  "ads.js",
  "database.js",
  "global-status.js",
  "payment.js",
  "settings.js",
  "updater-api.js",
  "updater.js",
  "providers/**/*",
  "node_modules/**/*",
  "bin/**/*",
  "cookies.txt"
];

fs.writeFileSync(path, JSON.stringify(pkg, null, 2), 'utf8');
console.log('Updated package.json files array');
