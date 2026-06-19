const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DOWNLOAD_PATH
    ? path.join(process.env.DOWNLOAD_PATH, 'db')
    : (process.platform === 'win32'
        ? path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'Documents', 'StreamVaultData')
        : path.join(process.env.HOME || '/tmp', 'StreamVaultData'));

const dbPath = path.join(DATA_DIR, 'streamvault.db');
console.log('Using DB at', dbPath);

if (!fs.existsSync(dbPath)) {
    console.log('DB does not exist here. Trying local folder...');
    const localDbPath = path.join(__dirname, 'streamvault.db');
    if (fs.existsSync(localDbPath)) {
        console.log('Found local DB at', localDbPath);
        const db = new Database(localDbPath);
        runUpdate(db);
    } else {
        console.log('No DB found anywhere!');
    }
} else {
    const db = new Database(dbPath);
    runUpdate(db);
}

function runUpdate(db) {
    const stmt = db.prepare(`UPDATE app_settings SET value_json = 'true' WHERE key IN ('youtube_enabled', 'instagram_enabled', 'facebook_enabled', 'converter_enabled', 'ads_enabled')`);
    const info = stmt.run();
    console.log('Updated app_settings:', info.changes, 'rows affected.');

    const rows = db.prepare(`SELECT key, value_json FROM app_settings WHERE key LIKE '%_enabled'`).all();
    console.log('Current settings:');
    console.log(rows);
}
