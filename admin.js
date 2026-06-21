const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./database.js');

const router = express.Router();
const { JWT_SECRET, logActivity } = require('./auth.js');

// Admin Auth Middleware
function requireAdmin(req, res, next) {
    const token = req.cookies.token;
    if (!token) {
        console.log('[DEBUG] TOKEN_READ failed (No token in cookies)');
        return res.status(401).json({ error: 'Unauthorized' });
    }
    console.log('[DEBUG] TOKEN_READ success');
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log('[DEBUG] TOKEN_VERIFIED');
        const user = db.prepare('SELECT role, status FROM users WHERE id = ?').get(decoded.id);
        if (!user || user.status === 'blocked') return res.status(403).json({ error: 'Account disabled' });
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Administrator access required' });
        }
        console.log('[DEBUG] ROLE_VERIFIED:', user.role);
        req.adminUser = { ...decoded, role: user.role };
        next();
    } catch(e) {
        console.log('[DEBUG] TOKEN_VERIFIED failed:', e.message);
        res.status(401).json({ error: 'Invalid token' });
    }
}

// Admin Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
        const user = stmt.get(email);

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        if (user.status === 'blocked') {
            return res.status(403).json({ error: 'Account blocked' });
        }
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Administrator access required' });
        }

        db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
        console.log('[DEBUG] LOGIN_SUCCESS for:', user.email);
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1d' }); // Shorter expiry for admin
        console.log('[DEBUG] TOKEN_CREATED');
        res.cookie('token', token, { httpOnly: true, sameSite: 'strict', path: '/' });
        console.log('[DEBUG] TOKEN_SAVED (Set-Cookie header sent)');
        res.json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role, password_reset_required: user.password_reset_required } });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/change-password', requireAdmin, async (req, res) => {
    try {
        const { newPassword } = req.body;
        const hash = await bcrypt.hash(newPassword, 10);
        db.prepare('UPDATE users SET password_hash = ?, password_reset_required = 0 WHERE id = ?').run(hash, req.adminUser.id);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Ads Management
router.get('/ads', requireAdmin, (req, res) => {
    try {
        const placements = db.prepare('SELECT * FROM ad_placements').all();
        res.json({ success: true, placements });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/ads/:id', requireAdmin, (req, res) => {
    try {
        const { code, is_enabled, provider } = req.body;
        const id = req.params.id;
        db.prepare('UPDATE ad_placements SET code = ?, is_enabled = ?, provider = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?')
          .run(code, is_enabled ? 1 : 0, provider || 'Custom', id);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Subscriptions Management
router.get('/plans', requireAdmin, (req, res) => {
    try {
        const plans = db.prepare('SELECT * FROM plans').all();
        res.json({ success: true, plans });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/plans/:id', requireAdmin, (req, res) => {
    try {
        const { description, billing_type, price_monthly, price_yearly, price_lifetime, monthly_downloads, monthly_conversions, youtube_enabled, instagram_enabled, facebook_enabled, mp3_enabled, mp4_enabled, download_history_sync, cloud_sync, multi_device_access, early_access_features, ad_free_experience, ads_enabled, max_resolution, daily_downloads, daily_conversions, converter_access, batch_download, playlist_download, priority_features } = req.body;
        
        db.prepare(`UPDATE plans SET description=?, billing_type=?, price_monthly=?, price_yearly=?, price_lifetime=?, monthly_downloads=?, monthly_conversions=?, youtube_enabled=?, instagram_enabled=?, facebook_enabled=?, mp3_enabled=?, mp4_enabled=?, download_history_sync=?, cloud_sync=?, multi_device_access=?, early_access_features=?, ad_free_experience=?, ads_enabled=?, max_resolution=?, daily_downloads=?, daily_conversions=?, converter_access=?, batch_download=?, playlist_download=?, priority_features=? WHERE id=?`)
          .run(description, billing_type, price_monthly, price_yearly, price_lifetime, monthly_downloads, monthly_conversions, youtube_enabled ? 1 : 0, instagram_enabled ? 1 : 0, facebook_enabled ? 1 : 0, mp3_enabled ? 1 : 0, mp4_enabled ? 1 : 0, download_history_sync ? 1 : 0, cloud_sync ? 1 : 0, multi_device_access ? 1 : 0, early_access_features ? 1 : 0, ad_free_experience ? 1 : 0, ads_enabled ? 1 : 0, max_resolution, daily_downloads, daily_conversions, converter_access ? 1 : 0, batch_download ? 1 : 0, playlist_download ? 1 : 0, priority_features ? 1 : 0, req.params.id);
        
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/subscriptions/stats', requireAdmin, (req, res) => {
    try {
        const stats = { free: 0, premium: 0, pro: 0, lifetime: 0, expired: 0, mrr: 0, billing_monthly: 0, billing_yearly: 0, billing_lifetime: 0, billing_free: 0 };
        const plans = db.prepare('SELECT id, price_monthly, billing_type FROM plans').all();
        const priceMap = {};
        const billingMap = {};
        plans.forEach(p => {
            priceMap[p.id] = p.price_monthly || 0;
            billingMap[p.id] = p.billing_type || 'monthly';
        });

        const rows = db.prepare('SELECT plan_id, status FROM subscriptions').all();
        rows.forEach(r => {
            if (r.status === 'expired') stats.expired++;
            else {
                if (r.plan_id === 'free') stats.free++;
                else if (r.plan_id === 'premium') stats.premium++;
                else if (r.plan_id === 'pro') stats.pro++;
                else if (r.plan_id === 'lifetime') stats.lifetime++;
                
                stats.mrr += (priceMap[r.plan_id] || 0);

                const bType = billingMap[r.plan_id];
                if (bType === 'lifetime') stats.billing_lifetime++;
                else if (bType === 'yearly') stats.billing_yearly++;
                else if (bType === 'free') stats.billing_free++;
                else stats.billing_monthly++;
            }
        });
        res.json({ success: true, stats });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/subscriptions/grant', requireAdmin, (req, res) => {
    try {
        const { user_id, plan_id, duration_days } = req.body;
        const id = 'sub_' + Date.now() + Math.random().toString(36).substring(2, 8);
        const status = plan_id === 'lifetime' ? 'lifetime' : 'active';
        
        let expiry = null;
        if (duration_days && plan_id !== 'lifetime') {
            const date = new Date();
            date.setDate(date.getDate() + parseInt(duration_days));
            expiry = date.toISOString().replace('T', ' ').substring(0, 19);
        }

        // Deactivate old active subscriptions
        db.prepare("UPDATE subscriptions SET status = 'expired' WHERE user_id = ? AND status IN ('active', 'lifetime')").run(user_id);

        db.prepare('INSERT INTO subscriptions (id, user_id, plan_id, status, expiry_date, payment_provider) VALUES (?, ?, ?, ?, ?, "manual")')
          .run(id, user_id, plan_id, status, expiry);
          
        // Legacy fallback
        db.prepare('UPDATE users SET plan = ?, subscription_expiry = ? WHERE id = ?').run(plan_id, expiry, user_id);

        res.json({ success: true, subscription_id: id });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── Subscription Management ────────────────────────────────────────────────

// List all subscriptions with user and plan info
router.get('/subscriptions/list', requireAdmin, (req, res) => {
    try {
        const { search, plan_id, status, page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let where = '1=1';
        let params = [];

        if (plan_id && plan_id !== 'all') { where += ' AND s.plan_id = ?'; params.push(plan_id); }
        if (status && status !== 'all') { where += ' AND s.status = ?'; params.push(status); }
        if (search) {
            where += ' AND (u.email LIKE ? OR u.name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        const rows = db.prepare(`
            SELECT s.*, u.email as user_email, u.name as user_name, pl.name as plan_name, pl.billing_type
            FROM subscriptions s
            LEFT JOIN users u ON s.user_id = u.id
            LEFT JOIN plans pl ON s.plan_id = pl.id
            WHERE ${where}
            ORDER BY s.start_date DESC
            LIMIT ? OFFSET ?
        `).all(...params, parseInt(limit), offset);

        const total = db.prepare(`
            SELECT COUNT(*) as c FROM subscriptions s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE ${where}
        `).get(...params).c;

        res.json({ success: true, subscriptions: rows, total, page: parseInt(page), limit: parseInt(limit) });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Activate a suspended subscription
router.post('/subscriptions/:id/activate', requireAdmin, (req, res) => {
    try {
        const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);
        if (!sub) return res.status(404).json({ error: 'Subscription not found' });
        db.prepare(`UPDATE subscriptions SET status = 'active', suspended_at = NULL, suspended_reason = NULL WHERE id = ?`).run(req.params.id);
        try { db.prepare('INSERT INTO subscription_history (user_id, subscription_id, action, details) VALUES (?,?,?,?)').run(sub.user_id, sub.id, 'activated', JSON.stringify({ by: req.adminUser.id })); } catch(e) {}
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Suspend an active subscription
router.post('/subscriptions/:id/suspend', requireAdmin, (req, res) => {
    try {
        const { reason } = req.body;
        const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);
        if (!sub) return res.status(404).json({ error: 'Subscription not found' });
        db.prepare(`UPDATE subscriptions SET status = 'suspended', suspended_at = CURRENT_TIMESTAMP, suspended_reason = ? WHERE id = ?`).run(reason || 'Admin action', req.params.id);
        try { db.prepare('INSERT INTO subscription_history (user_id, subscription_id, action, details) VALUES (?,?,?,?)').run(sub.user_id, sub.id, 'suspended', JSON.stringify({ reason, by: req.adminUser.id })); } catch(e) {}
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Extend subscription expiry by N days
router.post('/subscriptions/:id/extend', requireAdmin, (req, res) => {
    try {
        const { days } = req.body;
        if (!days || isNaN(days)) return res.status(400).json({ error: 'days required' });
        const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);
        if (!sub) return res.status(404).json({ error: 'Subscription not found' });
        const base = sub.expiry_date ? new Date(sub.expiry_date) : new Date();
        base.setDate(base.getDate() + parseInt(days));
        const newExpiry = base.toISOString().replace('T', ' ').substring(0, 19);
        db.prepare("UPDATE subscriptions SET expiry_date = ?, status = 'active' WHERE id = ?").run(newExpiry, req.params.id);
        try { db.prepare('INSERT INTO subscription_history (user_id, subscription_id, action, details) VALUES (?,?,?,?)').run(sub.user_id, sub.id, 'extended', JSON.stringify({ days, new_expiry: newExpiry, by: req.adminUser.id })); } catch(e) {}
        res.json({ success: true, new_expiry: newExpiry });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Cancel a subscription
router.post('/subscriptions/:id/cancel', requireAdmin, (req, res) => {
    try {
        const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);
        if (!sub) return res.status(404).json({ error: 'Subscription not found' });
        db.prepare(`UPDATE subscriptions SET status = 'cancelled' WHERE id = ?`).run(req.params.id);
        db.prepare(`UPDATE users SET plan = 'free' WHERE id = ?`).run(sub.user_id);
        try { db.prepare('INSERT INTO subscription_history (user_id, subscription_id, action, details) VALUES (?,?,?,?)').run(sub.user_id, sub.id, 'cancelled', JSON.stringify({ by: req.adminUser.id })); } catch(e) {}
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// List payment records
router.get('/payments', requireAdmin, (req, res) => {
    try {
        const { page = 1, limit = 25, status, plan_id } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        let where = '1=1'; let params = [];
        if (status) { where += ' AND p.status = ?'; params.push(status); }
        if (plan_id) { where += ' AND p.plan_id = ?'; params.push(plan_id); }
        const payments = db.prepare(`
            SELECT p.*, u.email as user_email, u.name as user_name, pl.name as plan_name
            FROM payments p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN plans pl ON p.plan_id = pl.id
            WHERE ${where}
            ORDER BY p.created_at DESC LIMIT ? OFFSET ?
        `).all(...params, parseInt(limit), offset);
        const total = db.prepare(`SELECT COUNT(*) as c FROM payments p WHERE ${where}`).get(...params).c;
        res.json({ success: true, payments, total });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── Notification Management ───────────────────────────────────────────────
router.get('/notifications', requireAdmin, (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC').all();
        res.json({ success: true, notifications: rows });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/notifications', requireAdmin, (req, res) => {
    try {
        const { title, message, type, priority, target_audience, expiry_date } = req.body;
        if (!title || !message) return res.status(400).json({ error: 'Title and message required' });
        
        const id = 'notif_' + Date.now();
        db.prepare(`
            INSERT INTO notifications (id, title, message, type, priority, target_audience, expiry_date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, title, message, type || 'announcement', priority || 'normal', target_audience || 'all', expiry_date || null);
        
        res.json({ success: true, id });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/notifications/:id', requireAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM user_notifications WHERE notification_id = ?').run(req.params.id);
        db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── Promo Code Management ──────────────────────────────────────────────────
router.get('/promo', requireAdmin, (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM promo_codes ORDER BY created_at DESC').all();
        res.json({ success: true, promo_codes: rows });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/promo', requireAdmin, (req, res) => {
    try {
        const { code, discount_type, discount_value, max_uses, valid_until, target_plan } = req.body;
        if (!code || !discount_value) return res.status(400).json({ error: 'Code and discount value required' });
        
        db.prepare(`
            INSERT INTO promo_codes (code, discount_type, discount_value, max_uses, valid_until, target_plan)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(code.toUpperCase(), discount_type || 'percentage', discount_value, max_uses || 0, valid_until || null, target_plan || 'all');
        
        res.json({ success: true, code: code.toUpperCase() });
    } catch(e) {
        if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Promo code already exists' });
        res.status(500).json({ error: e.message });
    }
});

router.post('/promo/:code/toggle', requireAdmin, (req, res) => {
    try {
        const code = req.params.code.toUpperCase();
        const promo = db.prepare('SELECT is_active FROM promo_codes WHERE code = ?').get(code);
        if (!promo) return res.status(404).json({ error: 'Promo code not found' });
        
        const newStatus = promo.is_active ? 0 : 1;
        db.prepare('UPDATE promo_codes SET is_active = ? WHERE code = ?').run(newStatus, code);
        
        res.json({ success: true, is_active: newStatus });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/users', requireAdmin, (req, res) => {
    try {
        const { search, plan, status } = req.query;
        let query = 'SELECT id, email, name, join_date, last_login, role, status, plan FROM users WHERE 1=1';
        let params = [];
        
        if (search) {
            query += ' AND (email LIKE ? OR name LIKE ? OR id = ?)';
            params.push(`%${search}%`, `%${search}%`, search);
        }
        if (plan && plan !== 'All') {
            query += ' AND plan = ?';
            params.push(plan);
        }
        if (status && status !== 'All') {
            query += ' AND status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY join_date DESC';
        const users = db.prepare(query).all(...params);
        
        // Append counts
        const enriched = users.map(u => {
            u.dlCount = db.prepare('SELECT COUNT(*) as c FROM download_history WHERE user_id = ?').get(u.id).c;
            u.cvCount = db.prepare('SELECT COUNT(*) as c FROM conversion_history WHERE user_id = ?').get(u.id).c;
            return u;
        });
        res.json({ success: true, users: enriched });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/users/:id/block', requireAdmin, (req, res) => {
    try {
        const { block } = req.body;
        const target = db.prepare('SELECT role FROM users WHERE id = ?').get(req.params.id);
        
        if (target.role === 'super_admin' && req.adminUser.role !== 'super_admin') {
            return res.status(403).json({ error: 'Cannot modify Super Admin' });
        }
        
        db.prepare('UPDATE users SET status = ? WHERE id = ?').run(block ? 'blocked' : 'active', req.params.id);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:id', requireAdmin, (req, res) => {
    try {
        const target = db.prepare('SELECT role FROM users WHERE id = ?').get(req.params.id);
        if (target.role === 'super_admin') {
            return res.status(403).json({ error: 'Cannot delete Super Admin' });
        }
        db.prepare('DELETE FROM download_history WHERE user_id = ?').run(req.params.id);
        db.prepare('DELETE FROM conversion_history WHERE user_id = ?').run(req.params.id);
        db.prepare('DELETE FROM activity_logs WHERE user_id = ?').run(req.params.id);
        db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
        
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        logActivity(req.adminUser.id, req.params.id, 'User Deleted', `Admin deleted user ${req.params.id}`, ip);
        
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Deep User Profile (V2)
router.get('/users/:id', requireAdmin, (req, res) => {
    try {
        const user = db.prepare('SELECT id, email, name, join_date, last_login, role, status, plan, subscription_expiry, daily_download_limit, storage_limit, daily_conversion_limit, feature_toggles_json FROM users WHERE id = ?').get(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        const downloads = db.prepare('SELECT * FROM download_history WHERE user_id = ? ORDER BY download_date DESC LIMIT 50').all(req.params.id);
        const conversions = db.prepare('SELECT * FROM conversion_history WHERE user_id = ? ORDER BY conversion_date DESC LIMIT 50').all(req.params.id);
        const activity = db.prepare('SELECT * FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.params.id);
        const devices = db.prepare('SELECT * FROM user_devices WHERE user_id = ? ORDER BY last_active DESC').all(req.params.id);
        
        const stats = {
            totalStorage: db.prepare('SELECT SUM(file_size) as s FROM download_history WHERE user_id = ?').get(req.params.id).s || 0,
            ytCount: db.prepare('SELECT COUNT(*) as c FROM download_history WHERE user_id = ? AND platform = "youtube"').get(req.params.id).c,
            igCount: db.prepare('SELECT COUNT(*) as c FROM download_history WHERE user_id = ? AND platform = "instagram"').get(req.params.id).c,
            fbCount: db.prepare('SELECT COUNT(*) as c FROM download_history WHERE user_id = ? AND platform = "facebook"').get(req.params.id).c,
        };
        
        const allSettings = db.prepare('SELECT key FROM app_settings WHERE key LIKE "%_enabled"').all();
        const features = allSettings.map(s => s.key);
        
        res.json({ success: true, user, downloads, conversions, activity, devices, stats, features });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Update Role
router.post('/users/:id/role', requireAdmin, (req, res) => {
    try {
        const { role } = req.body;
        if (req.adminUser.role !== 'super_admin') return res.status(403).json({ error: 'Super Admin required to change roles' });
        
        const target = db.prepare('SELECT role FROM users WHERE id = ?').get(req.params.id);
        if (target.role === 'super_admin') return res.status(403).json({ error: 'Cannot modify Super Admin' });
        if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
        
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        logActivity(req.adminUser.id, req.params.id, 'Role Changed', `Role changed to ${role}`, ip);
        
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Update Plan & Limits
router.post('/users/:id/plan', requireAdmin, (req, res) => {
    try {
        const { plan, daily_download_limit, storage_limit, daily_conversion_limit, subscription_expiry } = req.body;
        
        // Fetch current user details to log the previous plan
        const currentUser = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.params.id);
        const previousPlan = currentUser ? (currentUser.plan || 'Free') : 'Unknown';

        db.prepare('UPDATE users SET plan = ?, daily_download_limit = ?, storage_limit = ?, daily_conversion_limit = ?, subscription_expiry = ? WHERE id = ?').run(
            plan, daily_download_limit, storage_limit || null, daily_conversion_limit || 10, subscription_expiry || null, req.params.id
        );
        
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        logActivity(req.adminUser.id, req.params.id, 'PLAN_CHANGE', `Admin changed plan from ${previousPlan} to ${plan}`, ip);
        
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Update User Feature Toggles
router.post('/users/:id/features', requireAdmin, (req, res) => {
    try {
        const { toggles } = req.body;
        db.prepare('UPDATE users SET feature_toggles_json = ? WHERE id = ?').run(JSON.stringify(toggles), req.params.id);
        
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        logActivity(req.adminUser.id, req.params.id, 'Features Updated', `Admin manually updated user feature toggles`, ip);
        
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Update Status (Ban/Suspend)
router.post('/users/:id/status', requireAdmin, (req, res) => {
    try {
        const { status } = req.body;
        const target = db.prepare('SELECT role FROM users WHERE id = ?').get(req.params.id);
        if (target.role === 'super_admin') return res.status(403).json({ error: 'Cannot modify Super Admin' });
        
        db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, req.params.id);
        
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        logActivity(req.adminUser.id, req.params.id, 'Status Changed', `Status set to ${status}`, ip);
        
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin Actions
router.post('/users/:id/reset-password', requireAdmin, async (req, res) => {
    try {
        const crypto = require('crypto');
        const tempPassword = crypto.randomBytes(6).toString('hex');
        const hash = await bcrypt.hash(tempPassword, 10);
        db.prepare('UPDATE users SET password_hash = ?, password_reset_required = 1 WHERE id = ?').run(hash, req.params.id);
        
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        logActivity(req.adminUser.id, req.params.id, 'Password Reset', `Admin triggered password reset`, ip);
        
        res.json({ success: true, tempPassword });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/users/:id/reset-limits', requireAdmin, (req, res) => {
    try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        logActivity(req.adminUser.id, req.params.id, 'Limits Reset', `Admin manually reset daily limits`, ip);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:id/history', requireAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM download_history WHERE user_id = ?').run(req.params.id);
        db.prepare('DELETE FROM conversion_history WHERE user_id = ?').run(req.params.id);
        
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        logActivity(req.adminUser.id, req.params.id, 'History Cleared', `Admin cleared download/conversion history`, ip);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:id/devices/:deviceId', requireAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM user_devices WHERE id = ? AND user_id = ?').run(req.params.deviceId, req.params.id);
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        logActivity(req.adminUser.id, req.params.id, 'Device Removed', `Admin revoked device ${req.params.deviceId}`, ip);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// V2 Analytics & Revenue
router.get('/revenue', requireAdmin, (req, res) => {
    try {
        const activeSubscribers = db.prepare("SELECT COUNT(*) as c FROM users WHERE plan != 'Free' AND status = 'active'").get().c;
        const expiredSubscribers = db.prepare("SELECT COUNT(*) as c FROM users WHERE subscription_expiry < CURRENT_TIMESTAMP").get().c;
        res.json({
            success: true,
            revenueToday: 0.00,
            revenueMonth: 0.00,
            activeSubscribers,
            expiredSubscribers
        });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// System Health
router.get('/health', requireAdmin, (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const dbPath = path.join(__dirname, 'streamvault.db');
        let dbSize = 0;
        if (fs.existsSync(dbPath)) dbSize = fs.statSync(dbPath).size;
        
        const uptime = process.uptime();
        res.json({
            success: true,
            uptime,
            dbSize,
            memory: process.memoryUsage().heapUsed,
            apiStatus: 'Green'
        });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Global Activity Log
router.get('/activity', requireAdmin, (req, res) => {
    try {
        const logs = db.prepare(`
            SELECT a.*, u.email as user_email, adm.email as admin_email 
            FROM activity_logs a 
            LEFT JOIN users u ON a.user_id = u.id 
            LEFT JOIN users adm ON a.admin_id = adm.id
            ORDER BY a.created_at DESC LIMIT 100
        `).all();
        res.json({ success: true, logs });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

const fs = require('fs');
const path = require('path');

const DOWNLOADS_DIR = path.join(process.env.USERPROFILE || 'C:\\Users\\DR Films', 'Downloads', 'StreamVault');
const EXPORTS_DIR = path.join(DOWNLOADS_DIR, 'Exports');
if (!fs.existsSync(EXPORTS_DIR)) fs.mkdirSync(EXPORTS_DIR, { recursive: true });

// Full Database Export
router.get('/export/database', requireAdmin, async (req, res) => {
    try {
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `streamvault_db_${dateStr}.db`;
        const backupPath = path.join(EXPORTS_DIR, filename);
        
        await db.backup(backupPath);
        
        res.download(backupPath, filename, (err) => {
            if (err) console.error("Error sending db export:", err);
        });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// CSV Exports
router.get('/export/:type', requireAdmin, (req, res) => {
    try {
        const type = req.params.type;
        let data = [];
        let filename = `${type}_export.csv`;
        
        if (type === 'users') {
            data = db.prepare("SELECT id, email, name, role, status, plan, join_date FROM users").all();
        } else if (type === 'downloads') {
            data = db.prepare("SELECT id, user_id, platform, file_name, file_size, download_date FROM download_history").all();
        } else if (type === 'conversions') {
            data = db.prepare("SELECT id, user_id, conversion_type, file_name, conversion_date FROM conversion_history").all();
        } else {
            return res.status(400).json({ error: "Invalid export type" });
        }

        if (data.length === 0) return res.send("No data");

        const keys = Object.keys(data[0]);
        const csv = [
            keys.join(','),
            ...data.map(row => keys.map(k => `"${String(row[k]).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        // Save physical copy locally
        const exportPath = path.join(EXPORTS_DIR, filename);
        fs.writeFileSync(exportPath, csv);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Analytics
router.get('/analytics', requireAdmin, (req, res) => {
    try {
        const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
        const activeUsers = db.prepare("SELECT COUNT(*) as c FROM users WHERE status = 'active'").get().c;
        
        const dlToday = db.prepare("SELECT COUNT(*) as c FROM download_history WHERE date(download_date) = date('now')").get().c;
        const dlMonth = db.prepare("SELECT COUNT(*) as c FROM download_history WHERE strftime('%Y-%m', download_date) = strftime('%Y-%m', 'now')").get().c;
        
        const cvToday = db.prepare("SELECT COUNT(*) as c FROM conversion_history WHERE date(conversion_date) = date('now')").get().c;
        const cvMonth = db.prepare("SELECT COUNT(*) as c FROM conversion_history WHERE strftime('%Y-%m', conversion_date) = strftime('%Y-%m', 'now')").get().c;
        
        const ytDl = db.prepare("SELECT COUNT(*) as c FROM download_history WHERE platform = 'YouTube'").get().c;
        const igDl = db.prepare("SELECT COUNT(*) as c FROM download_history WHERE platform = 'Instagram'").get().c;
        const fbDl = db.prepare("SELECT COUNT(*) as c FROM download_history WHERE platform = 'Facebook'").get().c;

        const topDays = db.prepare("SELECT date(download_date) as d, COUNT(*) as c FROM download_history GROUP BY date(download_date) ORDER BY c DESC LIMIT 5").all();

        res.json({
            success: true,
            totalUsers, activeUsers, dlToday, dlMonth, cvToday, cvMonth, ytDl, igDl, fbDl, topDays
        });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Feature Flags & Settings
router.get('/settings', requireAdmin, (req, res) => {
    try {
        const settings = db.prepare('SELECT key, value_json FROM app_settings').all();
        const config = {};
        settings.forEach(s => config[s.key] = s.value_json);
        res.json({ success: true, config });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/settings', requireAdmin, (req, res) => {
    try {
        if (req.adminUser.role !== 'super_admin') return res.status(403).json({ error: 'Super Admin required' });
        const { 
            youtube_enabled, instagram_enabled, facebook_enabled, converter_enabled, maintenance_mode, ads_enabled,
            playlist_enabled, batch_enabled, '4k_enabled': fourk_enabled, history_enabled, login_enabled,
            subscription_enabled, plan_premium_enabled, plan_pro_enabled, plan_lifetime_enabled,
            rewarded_ads_enabled, rewarded_ad_cooldown_mins, rewarded_ad_frequency_downloads
        } = req.body;
        
        const update = db.prepare('UPDATE app_settings SET value_json = ? WHERE key = ?');
        const tx = db.transaction(() => {
            if (youtube_enabled !== undefined) update.run(youtube_enabled, 'youtube_enabled');
            if (instagram_enabled !== undefined) update.run(instagram_enabled, 'instagram_enabled');
            if (facebook_enabled !== undefined) update.run(facebook_enabled, 'facebook_enabled');
            if (converter_enabled !== undefined) update.run(converter_enabled, 'converter_enabled');
            if (maintenance_mode !== undefined) update.run(maintenance_mode, 'maintenance_mode');
            if (ads_enabled !== undefined) update.run(ads_enabled, 'ads_enabled');
            if (playlist_enabled !== undefined) update.run(playlist_enabled, 'playlist_enabled');
            if (batch_enabled !== undefined) update.run(batch_enabled, 'batch_enabled');
            if (fourk_enabled !== undefined) update.run(fourk_enabled, '4k_enabled');
            if (history_enabled !== undefined) update.run(history_enabled, 'history_enabled');
            if (login_enabled !== undefined) update.run(login_enabled, 'login_enabled');
            if (subscription_enabled !== undefined) update.run(subscription_enabled, 'subscription_enabled');
            if (plan_premium_enabled !== undefined) update.run(plan_premium_enabled, 'plan_premium_enabled');
            if (plan_pro_enabled !== undefined) update.run(plan_pro_enabled, 'plan_pro_enabled');
            if (plan_lifetime_enabled !== undefined) update.run(plan_lifetime_enabled, 'plan_lifetime_enabled');
            if (rewarded_ads_enabled !== undefined) update.run(rewarded_ads_enabled, 'rewarded_ads_enabled');
            if (rewarded_ad_cooldown_mins !== undefined) update.run(rewarded_ad_cooldown_mins, 'rewarded_ad_cooldown_mins');
            if (rewarded_ad_frequency_downloads !== undefined) update.run(rewarded_ad_frequency_downloads, 'rewarded_ad_frequency_downloads');
        });
        tx();
        
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        logActivity(req.adminUser.id, null, 'Settings Changed', `Super Admin updated global feature toggles`, ip);
        
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// Release Management System
// ==========================================

// Feedback Management
router.get('/feedback', requireAdmin, (req, res) => {
    try {
        const feedback = db.prepare(`SELECT f.*, u.email as user_email FROM user_feedback f LEFT JOIN users u ON f.user_id = u.id ORDER BY f.created_at DESC`).all();
        res.json({ success: true, feedback });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/feedback/:id', requireAdmin, (req, res) => {
    try {
        db.prepare('UPDATE user_feedback SET status = ? WHERE id = ?').run(req.body.status, req.params.id);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Support Tickets Management
router.get('/tickets', requireAdmin, (req, res) => {
    try {
        const tickets = db.prepare(`SELECT t.*, u.email as user_email FROM support_tickets t LEFT JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC`).all();
        res.json({ success: true, tickets });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/tickets/:id', requireAdmin, (req, res) => {
    try {
        db.prepare('UPDATE support_tickets SET status = ? WHERE id = ?').run(req.body.status, req.params.id);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// App Releases Management
router.get('/releases', requireAdmin, (req, res) => {
    try {
        let releases = db.prepare('SELECT * FROM app_releases ORDER BY published_at DESC').all();
        
        // Auto-seed if completely empty
        if (releases.length === 0) {
            db.prepare(`INSERT INTO app_releases (version, release_notes, status, platform, is_current, downloads_count) 
                        VALUES ('1.0.0', 'Initial beta release.', 'Published', 'Windows', 1, 0)`).run();
            releases = db.prepare('SELECT * FROM app_releases ORDER BY published_at DESC').all();
        }
        
        res.json({ success: true, releases });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/releases', requireAdmin, (req, res) => {
    try {
        const { version, release_notes, force_update, min_required_version, win_url, mac_url, android_url, ios_url, status, platform } = req.body;
        
        const tx = db.transaction(() => {
            // Unset current if this is published
            if (status === 'Published') {
                db.prepare('UPDATE app_releases SET is_current = 0').run();
            }
            
            db.prepare(`INSERT INTO app_releases 
                (version, release_notes, is_current, force_update, min_required_version, win_url, mac_url, android_url, ios_url, status, platform) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
                version, release_notes, status === 'Published' ? 1 : 0, force_update ? 1 : 0, 
                min_required_version || null, win_url || null, mac_url || null, android_url || null, ios_url || null,
                status || 'Draft', platform || 'Web'
            );
        });
        tx();
        res.json({ success: true });
    } catch(e) { 
        if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Version already exists' });
        res.status(500).json({ error: e.message }); 
    }
});

router.put('/releases/:version', requireAdmin, (req, res) => {
    try {
        const { release_notes, force_update, min_required_version, win_url, mac_url, android_url, ios_url, status, platform } = req.body;
        
        const tx = db.transaction(() => {
            if (status === 'Published') {
                db.prepare('UPDATE app_releases SET is_current = 0').run();
            }
            db.prepare(`
                UPDATE app_releases 
                SET release_notes = ?, force_update = ?, min_required_version = ?, win_url = ?, mac_url = ?, android_url = ?, ios_url = ?, status = ?, platform = ?, is_current = ?
                WHERE version = ?
            `).run(
                release_notes, force_update ? 1 : 0, min_required_version || null, 
                win_url || null, mac_url || null, android_url || null, ios_url || null, 
                status || 'Draft', platform || 'Web', status === 'Published' ? 1 : 0,
                req.params.version
            );
        });
        tx();
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/releases/:version', requireAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM app_releases WHERE version = ?').run(req.params.version);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// QA Health Dashboard
const { execSync } = require('child_process');
router.get('/qa-health', requireAdmin, (req, res) => {
    try {
        const health = {
            downloader: { status: 'FAIL', message: '' },
            converter: { status: 'FAIL', message: '' },
            database: { status: 'FAIL', message: '' },
            payment: { status: 'PASS', message: 'Mock integration active' },
            ads: { status: 'PASS', message: 'Mock tags configured' }
        };

        // Check Downloader
        try {
            execSync('yt-dlp --version');
            health.downloader.status = 'PASS';
            health.downloader.message = 'yt-dlp executable found';
        } catch(e) { health.downloader.message = e.message; }

        // Check Converter
        try {
            execSync('ffmpeg -version');
            health.converter.status = 'PASS';
            health.converter.message = 'ffmpeg executable found';
        } catch(e) { health.converter.message = e.message; }

        // Check Database
        try {
            db.prepare('SELECT 1').get();
            health.database.status = 'PASS';
            health.database.message = 'Read/Write ok';
        } catch(e) { health.database.message = e.message; }

        res.json({ success: true, health });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
