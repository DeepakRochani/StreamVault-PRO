const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Use DOWNLOAD_PATH (set by Render) or a cross-platform fallback — never the Windows-only USERPROFILE path
const DATA_DIR = process.env.DOWNLOAD_PATH
    ? path.join(process.env.DOWNLOAD_PATH, 'db')
    : (process.platform === 'win32'
        ? path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'Documents', 'StreamVaultData')
        : path.join(process.env.HOME || '/tmp', 'StreamVaultData'));
const BACKUPS_DIR = path.join(DATA_DIR, 'Backups');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'streamvault.db');

// Migrate legacy database if it exists
const legacyDbPath = path.join(__dirname, 'streamvault.db');
if (fs.existsSync(legacyDbPath) && !fs.existsSync(dbPath)) {
    console.log(`[Database] Migrating legacy database to local app data folder...`);
    fs.copyFileSync(legacyDbPath, dbPath);
}

const db = new Database(dbPath);
db.dbPath = dbPath; // attach path for other modules to use if needed

// Automated Daily Backup
setInterval(async () => {
    try {
        const dateStr = new Date().toISOString().split('T')[0];
        const backupPath = path.join(BACKUPS_DIR, `streamvault_backup_${dateStr}.db`);
        await db.backup(backupPath);
        console.log(`[Database] Daily backup created successfully at ${backupPath}`);
    } catch(err) {
        console.error(`[Database] Failed to create daily backup:`, err);
    }
}, 24 * 60 * 60 * 1000); // 24 hours

function initDB() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT,
            name TEXT,
            join_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            settings_json TEXT,
            role TEXT DEFAULT 'user',
            last_login DATETIME
        );
        
        CREATE TABLE IF NOT EXISTS download_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            platform TEXT,
            file_name TEXT,
            file_path TEXT,
            file_size INTEGER,
            download_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        
        CREATE TABLE IF NOT EXISTS conversion_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            conversion_type TEXT,
            file_name TEXT,
            file_path TEXT,
            conversion_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value_json TEXT
        );
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_id TEXT,
            user_id TEXT,
            action TEXT NOT NULL,
            details TEXT,
            ip_address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(admin_id) REFERENCES users(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS support_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            status TEXT DEFAULT 'open',
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS user_devices (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            device_type TEXT,
            os TEXT,
            browser TEXT,
            last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS ad_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            ad_location TEXT,
            event_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ad_placements (
            id TEXT PRIMARY KEY,
            name TEXT,
            code TEXT,
            is_enabled INTEGER DEFAULT 1,
            provider TEXT DEFAULT 'Custom',
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS plans (
            id TEXT PRIMARY KEY,
            name TEXT,
            price REAL,
            currency TEXT DEFAULT 'USD',
            billing_cycle TEXT,
            ads_enabled INTEGER DEFAULT 1,
            max_resolution TEXT DEFAULT '720p',
            daily_downloads INTEGER DEFAULT 10,
            daily_conversions INTEGER DEFAULT 5,
            converter_access INTEGER DEFAULT 0,
            batch_download INTEGER DEFAULT 0,
            playlist_download INTEGER DEFAULT 0,
            priority_features INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS subscriptions (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            plan_id TEXT,
            status TEXT,
            start_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            expiry_date DATETIME,
            payment_provider TEXT,
            payment_subscription_id TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(plan_id) REFERENCES plans(id)
        );

        CREATE TABLE IF NOT EXISTS subscription_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            subscription_id TEXT,
            action TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            details TEXT
        );

        CREATE TABLE IF NOT EXISTS payments (
            payment_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            plan_id TEXT NOT NULL,
            amount REAL DEFAULT 0,
            currency TEXT DEFAULT 'INR',
            status TEXT DEFAULT 'pending',
            provider TEXT DEFAULT 'simulated',
            provider_order_id TEXT,
            provider_payment_id TEXT,
            billing_cycle TEXT DEFAULT 'monthly',
            metadata_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(plan_id) REFERENCES plans(id)
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT DEFAULT 'announcement',
            priority TEXT DEFAULT 'normal',
            target_audience TEXT DEFAULT 'all',
            start_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            expiry_date DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_notifications (
            user_id TEXT,
            notification_id TEXT,
            is_read INTEGER DEFAULT 0,
            read_at DATETIME,
            PRIMARY KEY (user_id, notification_id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(notification_id) REFERENCES notifications(id)
        );

        CREATE TABLE IF NOT EXISTS promo_codes (
            code TEXT PRIMARY KEY,
            discount_type TEXT DEFAULT 'percentage',
            discount_value REAL NOT NULL,
            max_uses INTEGER DEFAULT 0,
            used_count INTEGER DEFAULT 0,
            valid_from DATETIME DEFAULT CURRENT_TIMESTAMP,
            valid_until DATETIME,
            target_plan TEXT DEFAULT 'all',
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_feedback (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            rating INTEGER,
            type TEXT DEFAULT 'suggestion',
            message TEXT,
            status TEXT DEFAULT 'new',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS app_releases (
            version TEXT PRIMARY KEY,
            release_notes TEXT,
            is_current INTEGER DEFAULT 0,
            force_update INTEGER DEFAULT 0,
            published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            min_required_version TEXT,
            win_url TEXT,
            mac_url TEXT,
            android_url TEXT,
            ios_url TEXT
        );
    `);
    
    // Migrations
    try { db.exec("ALTER TABLE users ADD COLUMN last_login DATETIME"); } catch(e) {}
    try { db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'"); } catch(e) {}
    try { db.exec("ALTER TABLE users ADD COLUMN password_reset_required INTEGER DEFAULT 0"); } catch(e) {}
    try { db.exec("ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'Free'"); } catch(e) {}
    try { db.exec("ALTER TABLE users ADD COLUMN subscription_expiry DATETIME"); } catch(e) {}
    try { db.exec("ALTER TABLE users ADD COLUMN daily_download_limit INTEGER DEFAULT 10"); } catch(e) {}
    try { db.exec("ALTER TABLE users ADD COLUMN feature_toggles_json TEXT"); } catch(e) {}
    try { db.exec("ALTER TABLE users ADD COLUMN storage_limit INTEGER"); } catch(e) {}
    try { db.exec("ALTER TABLE users ADD COLUMN daily_conversion_limit INTEGER DEFAULT 10"); } catch(e) {}
    
    // Auto Update Migrations
    try { db.exec("ALTER TABLE users ADD COLUMN auto_update INTEGER DEFAULT 1"); } catch(e) {}
    try { db.exec("ALTER TABLE users ADD COLUMN auto_download_updates INTEGER DEFAULT 1"); } catch(e) {}
    try { db.exec("ALTER TABLE app_releases ADD COLUMN min_required_version TEXT"); } catch(e) {}
    try { db.exec("ALTER TABLE app_releases ADD COLUMN win_url TEXT"); } catch(e) {}
    try { db.exec("ALTER TABLE app_releases ADD COLUMN mac_url TEXT"); } catch(e) {}
    try { db.exec("ALTER TABLE app_releases ADD COLUMN android_url TEXT"); } catch(e) {}
    try { db.exec("ALTER TABLE app_releases ADD COLUMN ios_url TEXT"); } catch(e) {}
    try { db.exec("ALTER TABLE app_releases ADD COLUMN status TEXT DEFAULT 'Draft'"); } catch(e) {}
    try { db.exec("ALTER TABLE app_releases ADD COLUMN downloads_count INTEGER DEFAULT 0"); } catch(e) {}
    try { db.exec("ALTER TABLE app_releases ADD COLUMN platform TEXT DEFAULT 'Web'"); } catch(e) {}

    // Subscription Migrations
    const subCols = [
        "billing_cycle TEXT DEFAULT 'monthly'",
        "payment_id TEXT",
        "suspended_at DATETIME",
        "suspended_reason TEXT"
    ];
    subCols.forEach(col => {
        try { db.exec(`ALTER TABLE subscriptions ADD COLUMN ${col}`); } catch(e) {}
    });
    const planCols = [
        "description TEXT", "billing_type TEXT DEFAULT 'monthly'", "price_monthly REAL", "price_yearly REAL", "price_lifetime REAL",
        "monthly_downloads INTEGER DEFAULT -1", "monthly_conversions INTEGER DEFAULT -1",
        "youtube_enabled INTEGER DEFAULT 1", "instagram_enabled INTEGER DEFAULT 1",
        "facebook_enabled INTEGER DEFAULT 1", "mp3_enabled INTEGER DEFAULT 1",
        "mp4_enabled INTEGER DEFAULT 1", "download_history_sync INTEGER DEFAULT 0",
        "cloud_sync INTEGER DEFAULT 0", "multi_device_access INTEGER DEFAULT 0",
        "early_access_features INTEGER DEFAULT 0", "ad_free_experience INTEGER DEFAULT 0"
    ];
    planCols.forEach(col => {
        try { db.exec(`ALTER TABLE plans ADD COLUMN ${col}`); } catch(e) {}
    });

    // Bootstrap Ad Placements
    const defaultPlacements = [
        { id: 'home_header', name: 'HEADER_BANNER' },
        { id: 'home_content', name: 'DOWNLOADER_CONTENT' },
        { id: 'home_download_complete', name: 'DOWNLOAD_COMPLETE' },
        { id: 'converter_content', name: 'CONVERTER_BANNER' },
        { id: 'converter_footer', name: 'CONVERTER_FOOTER_BANNER' },
        { id: 'profile_settings_footer', name: 'SETTINGS_FOOTER' }
    ];
    
    try {
        const adInsert = db.prepare('INSERT OR IGNORE INTO ad_placements (id, name, code) VALUES (?, ?, ?)');
        defaultPlacements.forEach(p => {
            adInsert.run(p.id, p.name, '<!-- Ads Management: No Code Set -->');
        });
    } catch(e) { console.error('Error bootstrapping ad placements:', e.message); }

    // Bootstrap Plans
    const defaultPlans = [
        { id: 'free', name: 'Free', ads_enabled: 1, max_resolution: '720p', daily_downloads: 20, daily_conversions: 10, converter_access: 0, batch_download: 0, playlist_download: 0, priority_features: 0, description: 'Basic features', billing_type: 'free', price_monthly: 0, price_yearly: 0, price_lifetime: 0, monthly_downloads: 300, monthly_conversions: 150, youtube_enabled: 1, instagram_enabled: 1, facebook_enabled: 1, mp3_enabled: 1, mp4_enabled: 1, download_history_sync: 0, cloud_sync: 0, multi_device_access: 0, early_access_features: 0, ad_free_experience: 0 },
        { id: 'premium', name: 'Premium', ads_enabled: 0, max_resolution: '1080p', daily_downloads: -1, daily_conversions: -1, converter_access: 1, batch_download: 0, playlist_download: 0, priority_features: 0, description: 'No Ads + Unlimited Downloads', billing_type: 'monthly', price_monthly: 99, price_yearly: 999, price_lifetime: 0, monthly_downloads: -1, monthly_conversions: -1, youtube_enabled: 1, instagram_enabled: 1, facebook_enabled: 1, mp3_enabled: 1, mp4_enabled: 1, download_history_sync: 1, cloud_sync: 0, multi_device_access: 1, early_access_features: 0, ad_free_experience: 1 },
        { id: 'pro', name: 'Pro', ads_enabled: 0, max_resolution: '4k', daily_downloads: -1, daily_conversions: -1, converter_access: 1, batch_download: 1, playlist_download: 1, priority_features: 1, description: '4K + Batch + Playlist Downloads', billing_type: 'monthly', price_monthly: 199, price_yearly: 1999, price_lifetime: 0, monthly_downloads: -1, monthly_conversions: -1, youtube_enabled: 1, instagram_enabled: 1, facebook_enabled: 1, mp3_enabled: 1, mp4_enabled: 1, download_history_sync: 1, cloud_sync: 1, multi_device_access: 1, early_access_features: 1, ad_free_experience: 1 },
        { id: 'lifetime', name: 'Lifetime', ads_enabled: 0, max_resolution: '4k', daily_downloads: -1, daily_conversions: -1, converter_access: 1, batch_download: 1, playlist_download: 1, priority_features: 1, description: 'All Pro Features Forever', billing_type: 'lifetime', price_monthly: 0, price_yearly: 0, price_lifetime: 4999, monthly_downloads: -1, monthly_conversions: -1, youtube_enabled: 1, instagram_enabled: 1, facebook_enabled: 1, mp3_enabled: 1, mp4_enabled: 1, download_history_sync: 1, cloud_sync: 1, multi_device_access: 1, early_access_features: 1, ad_free_experience: 1 }
    ];
    try {
        const planInsert = db.prepare(`INSERT OR IGNORE INTO plans 
        (id, name, ads_enabled, max_resolution, daily_downloads, daily_conversions, converter_access, batch_download, playlist_download, priority_features, description, billing_type, price_monthly, price_yearly, price_lifetime, monthly_downloads, monthly_conversions, youtube_enabled, instagram_enabled, facebook_enabled, mp3_enabled, mp4_enabled, download_history_sync, cloud_sync, multi_device_access, early_access_features, ad_free_experience) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        
        const planUpdate = db.prepare(`UPDATE plans SET description=?, billing_type=?, price_monthly=?, price_yearly=?, price_lifetime=?, youtube_enabled=?, instagram_enabled=?, facebook_enabled=?, mp3_enabled=?, mp4_enabled=?, download_history_sync=?, cloud_sync=?, multi_device_access=?, early_access_features=?, ad_free_experience=? WHERE id=?`);

        defaultPlans.forEach(p => {
            planInsert.run(p.id, p.name, p.ads_enabled, p.max_resolution, p.daily_downloads, p.daily_conversions, p.converter_access, p.batch_download, p.playlist_download, p.priority_features, p.description, p.billing_type, p.price_monthly, p.price_yearly, p.price_lifetime, p.monthly_downloads, p.monthly_conversions, p.youtube_enabled, p.instagram_enabled, p.facebook_enabled, p.mp3_enabled, p.mp4_enabled, p.download_history_sync, p.cloud_sync, p.multi_device_access, p.early_access_features, p.ad_free_experience);
            planUpdate.run(p.description, p.billing_type, p.price_monthly, p.price_yearly, p.price_lifetime, p.youtube_enabled, p.instagram_enabled, p.facebook_enabled, p.mp3_enabled, p.mp4_enabled, p.download_history_sync, p.cloud_sync, p.multi_device_access, p.early_access_features, p.ad_free_experience, p.id);
        });
        
        // Ensure billing types and free plan limits are corrected on boot
        db.exec("UPDATE plans SET billing_type = 'lifetime' WHERE id = 'lifetime'");
        db.exec("UPDATE plans SET billing_type = 'free', daily_downloads = 20, monthly_downloads = 300, daily_conversions = 10, monthly_conversions = 150 WHERE id = 'free'");
    } catch(e) { console.error('Error bootstrapping plans:', e.message); }

    // Bootstrap Super Admin
    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
    const adminEmail = 'admin@streamvault.com';
    const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
    if (!adminExists) {
        const id = crypto.randomUUID();
        const hash = bcrypt.hashSync('streamvault2026', 10);
        db.prepare(`INSERT INTO users (id, email, password_hash, name, role, status, password_reset_required) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, adminEmail, hash, 'Super Admin', 'super_admin', 'active', 1);
        console.log(`[Bootstrap] Created super_admin: ${adminEmail} with temp password: streamvault2026`);
    }

    // Default App Settings
    const defaultSettings = {
        'youtube_enabled': 'true',
        'instagram_enabled': 'true',
        'facebook_enabled': 'true',
        'converter_enabled': 'true',
        'maintenance_mode': 'false',
        'ads_enabled': 'true',
        'playlist_enabled': 'true',
        'batch_enabled': 'true',
        '4k_enabled': 'true',
        'history_enabled': 'true',
        'login_enabled': 'false',
        'subscription_enabled': 'false',
        'plan_premium_enabled': 'true',
        'plan_pro_enabled': 'true',
        'plan_lifetime_enabled': 'true',
        'rewarded_ads_enabled': 'true',
        'rewarded_ad_cooldown_mins': '15',
        'rewarded_ad_frequency_downloads': '3'
    };

    const insertStmt = db.prepare('INSERT INTO app_settings (key, value_json) VALUES (?, ?)');
    for (const [key, val] of Object.entries(defaultSettings)) {
        const exists = db.prepare("SELECT key FROM app_settings WHERE key = ?").get(key);
        if (!exists) {
            insertStmt.run(key, val);
        }
    }

    // Bootstrap Initial Release
    try {
        const releaseExists = db.prepare('SELECT version FROM app_releases LIMIT 1').get();
        if (!releaseExists) {
            db.prepare('INSERT INTO app_releases (version, release_notes, is_current) VALUES (?, ?, ?)').run('v1.0.0', 'Initial public beta release', 1);
        }
    } catch(e) { console.error('Error bootstrapping releases:', e.message); }
}

initDB();

module.exports = db;
