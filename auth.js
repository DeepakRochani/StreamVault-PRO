const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./database.js');

const router = express.Router();
const rateLimit = require('express-rate-limit');
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        console.error('FATAL ERROR: process.env.JWT_SECRET is not set in production. Shutting down.');
        process.exit(1);
    } else {
        console.warn('WARNING: Using insecure fallback JWT_SECRET for development.');
    }
}
const ACTIVE_JWT_SECRET = JWT_SECRET || 'streamvault_super_secret_key_2026';

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 login/register requests per windowMs
    message: { error: 'Too many login attempts from this IP, please try again after 15 minutes' }
});

const logActivity = (adminId, userId, action, details, ip) => {
    try {
        db.prepare('INSERT INTO activity_logs (admin_id, user_id, action, details, ip_address) VALUES (?, ?, ?, ?, ?)').run(adminId, userId, action, details, ip);
    } catch(e) { console.error("Failed to log activity:", e.message); }
};

const recordDevice = (req, userId) => {
    try {
        const ua = req.headers['user-agent'] || 'Unknown Device';
        let os = 'Unknown OS';
        if (ua.includes('Windows')) os = 'Windows';
        else if (ua.includes('Mac OS')) os = 'Mac OS';
        else if (ua.includes('Android')) os = 'Android';
        else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
        else if (ua.includes('Linux')) os = 'Linux';
        
        let browser = 'Unknown Browser';
        if (ua.includes('Edg')) browser = 'Edge';
        else if (ua.includes('Chrome')) browser = 'Chrome';
        else if (ua.includes('Firefox')) browser = 'Firefox';
        else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';

        const deviceId = crypto.createHash('md5').update(`${userId}-${os}-${browser}`).digest('hex');
        const deviceType = (os === 'Android' || os === 'iOS') ? 'Mobile' : 'Desktop';
        
        db.prepare(`
            INSERT INTO user_devices (id, user_id, device_type, os, browser, last_active) 
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET last_active = CURRENT_TIMESTAMP
        `).run(deviceId, userId, deviceType, os, browser);
    } catch(e) { console.error("Failed to record device:", e.message); }
};

router.post('/register', authLimiter, async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

        const stmt = db.prepare('SELECT id FROM users WHERE email = ?');
        if (stmt.get(email)) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        const id = crypto.randomUUID();
        const hash = await bcrypt.hash(password, 10);
        
        const insert = db.prepare('INSERT INTO users (id, email, password_hash, name, settings_json) VALUES (?, ?, ?, ?, ?)');
        const defaultSettings = JSON.stringify({ defaultFolder: '', theme: 'dark', defaultQuality: 'Best' });
        insert.run(id, email, hash, name || email.split('@')[0], defaultSettings);

        recordDevice(req, id);

        const token = jwt.sign({ id, email }, ACTIVE_JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, sameSite: 'strict' });
        res.json({ success: true, user: { id, email, name: name || email.split('@')[0] } });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
        const user = stmt.get(email);

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        if (user.status === 'blocked') {
            return res.status(403).json({ error: 'Your account has been suspended by an administrator.' });
        }

        db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        logActivity(null, user.id, 'User Login', 'User authenticated via password', ip);
        
        recordDevice(req, user.id);

        const token = jwt.sign({ id: user.id, email: user.email }, ACTIVE_JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, sameSite: 'strict' });
        res.json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/mock-google', (req, res) => {
    try {
        const email = 'demo.user@gmail.com';
        const name = 'Demo Google User';
        
        const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
        let user = stmt.get(email);
        
        if (user && user.status === 'blocked') {
            return res.status(403).json({ error: 'Your account has been suspended by an administrator.' });
        }
        
        if (!user) {
            const id = crypto.randomUUID();
            const insert = db.prepare('INSERT INTO users (id, email, password_hash, name, settings_json) VALUES (?, ?, ?, ?, ?)');
            const defaultSettings = JSON.stringify({ defaultFolder: '', theme: 'dark', defaultQuality: 'Best' });
            insert.run(id, email, 'MOCK_GOOGLE_NO_PASS', name, defaultSettings);
            user = { id, email, name };
        }
        
        db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        logActivity(null, user.id, 'User Login', 'User authenticated via mock Google login', ip);
        
        recordDevice(req, user.id);

        const token = jwt.sign({ id: user.id, email: user.email }, ACTIVE_JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, sameSite: 'strict' });
        res.json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

router.post('/supabase-sync', async (req, res) => {
    try {
        const { access_token } = req.body;
        if (!access_token) return res.status(400).json({ error: 'Access token required' });

        const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xphhazisatxmlulhqxvi.supabase.co';
        const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwaGhhemlzYXR4bWx1bGhxeHZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MjE3MDgsImV4cCI6MjA5NzQ5NzcwOH0.AXKS6RQjzGJYCig5mzWoCwKQ6e27TWLX2GAlvTsInwM';

        // Verify the token by calling Supabase user info endpoint
        const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { 
                'Authorization': `Bearer ${access_token}`, 
                'apikey': SUPABASE_ANON_KEY 
            }
        });
        const user = await response.json();
        
        if (user.error || !user.email) {
            return res.status(401).json({ error: 'Invalid Supabase token' });
        }

        // Check if user exists in SQLite
        const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
        let localUser = stmt.get(user.email);
        
        if (!localUser) {
            const id = user.id; // Keep IDs consistent
            const insert = db.prepare('INSERT INTO users (id, email, password_hash, name, settings_json) VALUES (?, ?, ?, ?, ?)');
            const defaultSettings = JSON.stringify({ defaultFolder: '', theme: 'dark', defaultQuality: 'Best' });
            insert.run(id, user.email, 'SUPABASE_AUTH_NO_LOCAL_PASSWORD', user.email.split('@')[0], defaultSettings);
            localUser = { id, email: user.email, name: user.email.split('@')[0] };
        } else if (localUser.status === 'blocked') {
            return res.status(403).json({ error: 'Your account has been suspended.' });
        }

        db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(localUser.id);
        recordDevice(req, localUser.id);

        // Generate local session cookie
        const token = jwt.sign({ id: localUser.id, email: localUser.email }, ACTIVE_JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, sameSite: 'strict', path: '/' });
        res.json({ success: true, user: { id: localUser.id, email: localUser.email, name: localUser.name } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/me', (req, res) => {
    let token = req.cookies.token;
    
    if (!token) {
        try {
            const loginRequired = db.prepare("SELECT value_json FROM app_settings WHERE key = 'login_enabled'").get();
            if (loginRequired && loginRequired.value_json === 'false') {
                const id = crypto.randomUUID();
                const guestEmail = `guest_${id.split('-')[0]}@streamvault.local`;
                const hash = bcrypt.hashSync(crypto.randomUUID(), 10);
                const defaultSettings = JSON.stringify({ defaultFolder: '', theme: 'dark', defaultQuality: 'Best' });
                
                db.prepare('INSERT INTO users (id, email, password_hash, name, role, settings_json) VALUES (?, ?, ?, ?, ?, ?)')
                  .run(id, guestEmail, hash, 'Guest User', 'guest', defaultSettings);
                  
                token = jwt.sign({ id, email: guestEmail }, ACTIVE_JWT_SECRET, { expiresIn: '30d' });
                res.cookie('token', token, { httpOnly: true, sameSite: 'strict' });
                console.log(`[Auth] Auto-generated Guest Session: ${guestEmail}`);
            }
        } catch (e) {
            console.error("[Auth] Guest generation failed:", e.message);
        }
    }

    if (!token) return res.json({ loggedIn: false });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = db.prepare('SELECT id, email, name, join_date, last_login, settings_json, role, status, plan, auto_update, auto_download_updates FROM users WHERE id = ?').get(decoded.id);
        if (!user || user.status === 'blocked') return res.json({ loggedIn: false });
        
        try {
            const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ? AND status IN ("active", "lifetime") AND (expiry_date IS NULL OR expiry_date > CURRENT_TIMESTAMP) ORDER BY start_date DESC LIMIT 1').get(user.id);
            if (sub) {
                user.subscription = sub;
                user.limits = db.prepare('SELECT * FROM plans WHERE id = ?').get(sub.plan_id);
            } else {
                // Default to Free plan limits if no active subscription exists
                user.limits = db.prepare('SELECT * FROM plans WHERE id = "free"').get();
                user.subscription = { status: 'expired', plan_id: 'free' };
            }
        } catch(e) { 
            // Fallback before migration runs
            user.limits = { ads_enabled: user.plan !== 'Premium' && user.plan !== 'Pro' && user.plan !== 'Lifetime', daily_downloads: 10 };
        }
        try {
            const currentPlan = user.subscription ? user.subscription.plan_id : 'free';
            const notifications = db.prepare(`
                SELECT n.* FROM notifications n
                LEFT JOIN user_notifications un ON n.id = un.notification_id AND un.user_id = ?
                WHERE (n.target_audience = 'all' OR n.target_audience = ?)
                AND (n.expiry_date IS NULL OR n.expiry_date > CURRENT_TIMESTAMP)
                AND un.is_read IS NOT 1
                ORDER BY n.created_at DESC
            `).all(user.id, currentPlan);
            user.notifications = notifications;
        } catch (e) {
            user.notifications = [];
        }
        try {
            const today = new Date().toISOString().split('T')[0] + ' 00:00:00';
            const thisMonth = new Date().toISOString().substring(0, 7) + '-01 00:00:00';
            
            user.usage = {
                downloadsToday: db.prepare('SELECT COUNT(*) as c FROM download_history WHERE user_id = ? AND download_date >= ?').get(user.id, today).c,
                downloadsMonth: db.prepare('SELECT COUNT(*) as c FROM download_history WHERE user_id = ? AND download_date >= ?').get(user.id, thisMonth).c,
                conversionsToday: db.prepare('SELECT COUNT(*) as c FROM conversion_history WHERE user_id = ? AND conversion_date >= ?').get(user.id, today).c,
                conversionsMonth: db.prepare('SELECT COUNT(*) as c FROM conversion_history WHERE user_id = ? AND conversion_date >= ?').get(user.id, thisMonth).c
            };
        } catch(e) {
            user.usage = { downloadsToday: 0, downloadsMonth: 0, conversionsToday: 0, conversionsMonth: 0 };
        }
        
        res.json({ loggedIn: true, user });
    } catch(e) {
        res.json({ loggedIn: false });
    }
});

router.post('/notifications/:id/read', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        db.prepare(`
            INSERT INTO user_notifications (user_id, notification_id, is_read, read_at)
            VALUES (?, ?, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, notification_id) DO UPDATE SET is_read = 1, read_at = CURRENT_TIMESTAMP
        `).run(decoded.id, req.params.id);
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});
// History Endpoints for Profile
router.get('/history/downloads', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const history = db.prepare('SELECT * FROM download_history WHERE user_id = ? ORDER BY download_date DESC').all(decoded.id);
        res.json({ success: true, history });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/history/conversions', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const history = db.prepare('SELECT * FROM conversion_history WHERE user_id = ? ORDER BY conversion_date DESC').all(decoded.id);
        res.json({ success: true, history });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/stats', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const dlCount = db.prepare('SELECT COUNT(*) as c FROM download_history WHERE user_id = ?').get(decoded.id).c;
        const cvCount = db.prepare('SELECT COUNT(*) as c FROM conversion_history WHERE user_id = ?').get(decoded.id).c;
        const ytCount = db.prepare('SELECT COUNT(*) as c FROM download_history WHERE user_id = ? AND platform = "YouTube"').get(decoded.id).c;
        const igCount = db.prepare('SELECT COUNT(*) as c FROM download_history WHERE user_id = ? AND platform = "Instagram"').get(decoded.id).c;
        const fbCount = db.prepare('SELECT COUNT(*) as c FROM download_history WHERE user_id = ? AND platform = "Facebook"').get(decoded.id).c;
        res.json({ success: true, stats: { dlCount, cvCount, ytCount, igCount, fbCount } });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/history/downloads/:id', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        db.prepare('DELETE FROM download_history WHERE id = ? AND user_id = ?').run(req.params.id, decoded.id);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/history/conversions/:id', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        db.prepare('DELETE FROM conversion_history WHERE id = ? AND user_id = ?').run(req.params.id, decoded.id);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/settings', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const newSettings = req.body;
        db.prepare('UPDATE users SET settings_json = ? WHERE id = ?').run(JSON.stringify(newSettings), decoded.id);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/settings/auto-update', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { key, value } = req.body;
        if (key === 'auto_update') {
            db.prepare('UPDATE users SET auto_update = ? WHERE id = ?').run(value, decoded.id);
        } else if (key === 'auto_download_updates') {
            db.prepare('UPDATE users SET auto_download_updates = ? WHERE id = ?').run(value, decoded.id);
        }
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Helper for pushing history internally in server.js
const logDownloadHistory = (userId, platform, fileName, filePath, fileSize) => {
    try {
        db.prepare('INSERT INTO download_history (user_id, platform, file_name, file_path, file_size) VALUES (?, ?, ?, ?, ?)')
          .run(userId, platform, fileName, filePath, fileSize);
    } catch(e) { console.error('Failed to log download history:', e.message); }
};

const logConversionHistory = (userId, type, fileName, filePath) => {
    try {
        db.prepare('INSERT INTO conversion_history (user_id, conversion_type, file_name, file_path) VALUES (?, ?, ?, ?)')
          .run(userId, type, fileName, filePath);
    } catch(e) { console.error('Failed to log conversion history:', e.message); }
};

const logDownloadWithToken = (token, platform, fileName, filePath, fileSize) => {
    if (!token) return;
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        logDownloadHistory(decoded.id, platform, fileName, filePath, fileSize);
    } catch(e) {}
};

const logConversionWithToken = (token, type, fileName, filePath) => {
    if (!token) return;
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        logConversionHistory(decoded.id, type, fileName, filePath);
    } catch(e) {}
};

module.exports = { router, JWT_SECRET: ACTIVE_JWT_SECRET, ACTIVE_JWT_SECRET, logDownloadHistory, logConversionHistory, logDownloadWithToken, logConversionWithToken, logActivity };
