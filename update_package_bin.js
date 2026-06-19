const fs = require('fs');
const path = 'C:/Users/DR Films/.gemini/antigravity-ide/scratch/streamvault-downloader/package.json';

const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));

if (!pkg.build.files.includes('bin/**/*')) {
    pkg.build.files.push('bin/**/*');
}
if (!pkg.build.asarUnpack.includes('**/bin/**/*')) {
    pkg.build.asarUnpack.push('**/bin/**/*');
}

fs.writeFileSync(path, JSON.stringify(pkg, null, 2), 'utf8');
console.log('Added bin/**/* to electron-builder files and asarUnpack');
