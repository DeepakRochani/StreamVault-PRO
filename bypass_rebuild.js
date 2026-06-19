const fs = require('fs');
const path = 'C:/Users/DR Films/.gemini/antigravity-ide/scratch/streamvault-downloader/package.json';

const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));

pkg.build.npmRebuild = false;
pkg.build.buildDependenciesFromSource = false;

fs.writeFileSync(path, JSON.stringify(pkg, null, 2), 'utf8');
console.log('Disabled npmRebuild to bypass missing Visual Studio build tools.');
