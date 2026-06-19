const fs = require('fs');

function replaceBcrypt(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes("require('bcrypt')")) {
        content = content.replace(/require\('bcrypt'\)/g, "require('bcryptjs')");
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Replaced bcrypt with bcryptjs in ${filePath}`);
    }
}

replaceBcrypt('C:/Users/DR Films/.gemini/antigravity-ide/scratch/streamvault-downloader/auth.js');
replaceBcrypt('C:/Users/DR Films/.gemini/antigravity-ide/scratch/streamvault-downloader/admin.js');
