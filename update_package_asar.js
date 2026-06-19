const fs = require('fs');
const path = 'C:/Users/DR Films/.gemini/antigravity-ide/scratch/streamvault-downloader/package.json';
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));

pkg.build.asar = false;
delete pkg.build.asarUnpack; // No longer needed if asar is false

fs.writeFileSync(path, JSON.stringify(pkg, null, 2), 'utf8');
console.log('Disabled ASAR packaging');
