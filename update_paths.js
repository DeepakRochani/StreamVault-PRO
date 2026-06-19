const fs = require('fs');
const path = require('path');

// 1. Update .env.example
const envPath = 'C:/Users/DR Films/.gemini/antigravity-ide/scratch/streamvault-downloader/.env.example';
let envContent = fs.readFileSync(envPath, 'utf8');

if (!envContent.includes('DOWNLOAD_PATH')) {
    envContent += `\n# The root directory for the persistent database and file caching
# Recommended for Render: /opt/render/project/data
DOWNLOAD_PATH=/opt/render/project/data\n`;
    fs.writeFileSync(envPath, envContent, 'utf8');
}

// 2. Update server.js
const serverPath = 'C:/Users/DR Films/.gemini/antigravity-ide/scratch/streamvault-downloader/server.js';
let serverContent = fs.readFileSync(serverPath, 'utf8');

const oldDirDefinition = `const DOWNLOADS_DIR = path.join(process.env.USERPROFILE || 'C:\\\\Users\\\\DR Films', 'Downloads', 'StreamVault');`;
const newDirDefinition = `const DOWNLOADS_DIR = process.env.DOWNLOAD_PATH || path.join(process.env.USERPROFILE || 'C:\\\\Users\\\\DR Films', 'Downloads', 'StreamVault');`;

if (serverContent.includes(oldDirDefinition)) {
    serverContent = serverContent.replace(oldDirDefinition, newDirDefinition);
    fs.writeFileSync(serverPath, serverContent, 'utf8');
    console.log('Updated server.js paths');
} else {
    console.log('DOWNLOADS_DIR already updated or not found');
}
