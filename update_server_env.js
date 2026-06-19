const fs = require('fs');

// 1. Update auth.js
const authPath = 'C:/Users/DR Films/.gemini/antigravity-ide/scratch/streamvault-downloader/auth.js';
let authContent = fs.readFileSync(authPath, 'utf8');

const oldSecretLine = `const JWT_SECRET = process.env.JWT_SECRET || 'streamvault_super_secret_key_2026';`;
const newSecretLine = `const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        console.error('FATAL ERROR: process.env.JWT_SECRET is not set in production. Shutting down.');
        process.exit(1);
    } else {
        console.warn('WARNING: Using insecure fallback JWT_SECRET for development.');
    }
}
const ACTIVE_JWT_SECRET = JWT_SECRET || 'streamvault_super_secret_key_2026';`;

if (authContent.includes(oldSecretLine)) {
    authContent = authContent.replace(oldSecretLine, newSecretLine);
    authContent = authContent.replace(/JWT_SECRET,/g, 'ACTIVE_JWT_SECRET,');
    authContent = authContent.replace(/ JWT_SECRET,/g, ' ACTIVE_JWT_SECRET,');
    fs.writeFileSync(authPath, authContent, 'utf8');
}

// 2. Update server.js
const serverPath = 'C:/Users/DR Films/.gemini/antigravity-ide/scratch/streamvault-downloader/server.js';
let serverContent = fs.readFileSync(serverPath, 'utf8');

const oldStaticLine = `app.use(express.static(__dirname));`;
const newStaticLine = `if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
} else {
    app.use(express.static(__dirname));
}`;

if (serverContent.includes(oldStaticLine)) {
    serverContent = serverContent.replace(oldStaticLine, newStaticLine);
    fs.writeFileSync(serverPath, serverContent, 'utf8');
}

console.log('Successfully updated server and auth configs for production.');
