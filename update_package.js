const fs = require('fs');
const path = 'C:/Users/DR Films/.gemini/antigravity-ide/scratch/streamvault-downloader/package.json';

const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));

pkg.main = "main.js";

pkg.scripts.electron = "concurrently \\\"npm run server\\\" \\\"electron .\\\"";
pkg.scripts.dist = "electron-builder";

pkg.build = {
  "appId": "com.streamvault.pro",
  "productName": "StreamVault PRO",
  "directories": {
    "output": "release"
  },
  "files": [
    "dist/**/*",
    "main.js",
    "preload.js",
    "server.js",
    "auth.js",
    "admin.js",
    "updater-api.js",
    "database.js",
    "payment.js",
    "node_modules/**/*"
  ],
  "asarUnpack": [
    "**/node_modules/@ffmpeg-installer/**/*"
  ],
  "win": {
    "target": [
      "nsis",
      "portable"
    ]
  },
  "nsis": {
    "oneClick": false,
    "perMachine": true,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true
  }
};

fs.writeFileSync(path, JSON.stringify(pkg, null, 2), 'utf8');
console.log('package.json updated for electron-builder');
