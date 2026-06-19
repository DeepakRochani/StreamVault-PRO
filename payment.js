/**
 * StreamVault PRO — Payment & Subscription Activation Router
 * Mounted at: /api/payment
 *
 * Architecture is provider-agnostic. Switch providers in providers/index.js
 * without changing any route logic here.
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./database.js');
const { JWT_SECRET, logActivity } = require('./auth.js');
const { getProvider } = require('./providers/index.js');

const router = express.Router();

// ─── Auth Middleware ─────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
    const token = req.cookies && req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Login required' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = db.prepare('SELECT id, email, name, status FROM users WHERE id = ?').get(decoded.id);
        if (!user || user.status === 'blocked') return res.status(403).json({ error: 'Account disabled' });
        req.user = user;
        next();
    } catch(e) {
        res.status(401).json({ error: 'Invalid session' });
    }
}

// ─── Core: activateSubscription ───────────────────────────────────────────────
/**
 * Activates a subscription for a user after successful payment.
 * Handles expiry calculation for monthly/yearly/lifetime billing cycles.
 */
function activateSubscription(userId, planId, billingCycle, paymentId) {
    const isLifetime = planId === 'lifetime' || billingCycle === 'lifetime';
    const status = isLifetime ? 'lifetime' : 'active';

    let expiryDate = null;
    if (!isLifetime) {
        const date = new Date();
        if (billingCycle === 'yearly') {
            date.setFullYear(date.getFullYear() + 1);
        } else {
            date.setDate(date.getDate() + 30); // monthly
        }
        expiryDate = date.toISOString().replace('T', ' ').substring(0, 19);
    }

    const subId = 'sub_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');

    // Expire all previous active subscriptions
    db.prepare(`UPDATE subscriptions SET status = 'expired' WHERE user_id = ? AND status IN ('active', 'lifetime')`)
      .run(userId);

    // Create new subscription
    db.prepare(`
        INSERT INTO subscriptions (id, user_id, plan_id, status, expiry_date, payment_provider, payment_id, billing_cycle)
        VALUES (?, ?, ?, ?, ?, 'simulated', ?, ?)
    `).run(subId, userId, planId, status, expiryDate, paymentId, billingCycle);

    // Log to history
    try {
        db.prepare(`INSERT INTO subscription_history (user_id, subscription_id, action, details) VALUES (?, ?, ?, ?)`)
          .run(userId, subId, 'activated', JSON.stringify({ planId, billingCycle, paymentId }));
    } catch(e) {}

    // Legacy fallback update
    db.prepare(`UPDATE users SET plan = ?, subscription_expiry = ? WHERE id = ?`).run(planId, expiryDate, userId);

    return { subId, status, expiryDate };
}

// ─── POST /api/payment/promo/validate ───────────────────────────────────────
// Validates a promo code for a given plan
router.post('/promo/validate', requireAuth, (req, res) => {
    try {
        const { code, plan_id } = req.body;
        if (!code || !plan_id) return res.status(400).json({ error: 'Code and plan_id required' });

        const promo = db.prepare('SELECT * FROM promo_codes WHERE code = ? COLLATE NOCASE').get(code);
        if (!promo) return res.status(404).json({ error: 'Invalid promo code' });
        
        if (!promo.is_active) return res.status(400).json({ error: 'Promo code is inactive' });
        if (promo.valid_until && new Date(promo.valid_until) < new Date()) return res.status(400).json({ error: 'Promo code expired' });
        if (promo.max_uses > 0 && promo.used_count >= promo.max_uses) return res.status(400).json({ error: 'Promo code usage limit reached' });
        if (promo.target_plan !== 'all' && promo.target_plan !== plan_id) return res.status(400).json({ error: 'Promo code not valid for this plan' });

        res.json({ success: true, promo });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── POST /api/payment/initiate ───────────────────────────────────────────────
// Creates a payment record and returns an order ready for the provider checkout.
router.post('/initiate', requireAuth, async (req, res) => {
    try {
        const { plan_id, billing_cycle, promo_code } = req.body;
        if (!plan_id || !billing_cycle) {
            return res.status(400).json({ error: 'plan_id and billing_cycle are required' });
        }

        const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(plan_id);
        if (!plan) return res.status(404).json({ error: 'Plan not found' });

        // Calculate amount based on billing cycle
        let amount = 0;
        if (billing_cycle === 'lifetime') amount = plan.price_lifetime || 0;
        else if (billing_cycle === 'yearly') amount = plan.price_yearly || 0;
        else amount = plan.price_monthly || 0;

        // Apply Promo Code if provided
        let appliedPromo = null;
        if (promo_code) {
            const promo = db.prepare('SELECT * FROM promo_codes WHERE code = ? COLLATE NOCASE').get(promo_code);
            if (promo && promo.is_active && (!promo.valid_until || new Date(promo.valid_until) >= new Date()) && (promo.max_uses === 0 || promo.used_count < promo.max_uses) && (promo.target_plan === 'all' || promo.target_plan === plan_id)) {
                if (promo.discount_type === 'percentage') {
                    amount = amount - (amount * (promo.discount_value / 100));
                } else {
                    amount = amount - promo.discount_value;
                }
                if (amount < 0) amount = 0;
                appliedPromo = promo.code;
            } else {
                return res.status(400).json({ error: 'Promo code invalid or expired' });
            }
        }

        const amountInPaise = Math.round(amount * 100); // Convert ₹ to paise

        // Create pending payment record
        const paymentId = 'pay_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
        const metadata = { initiated_at: new Date().toISOString() };
        if (appliedPromo) metadata.promo_code = appliedPromo;

        db.prepare(`
            INSERT INTO payments (payment_id, user_id, plan_id, amount, currency, status, provider, billing_cycle, metadata_json)
            VALUES (?, ?, ?, ?, 'INR', 'pending', ?, ?, ?)
        `).run(paymentId, req.user.id, plan_id, amount, getProvider().PROVIDER_NAME, billing_cycle,
            JSON.stringify(metadata));

        // Create provider order
        const provider = getProvider();
        const order = await provider.createOrder(amountInPaise, 'INR', paymentId);

        res.json({
            success: true,
            payment_id: paymentId,
            order,
            plan: {
                id: plan.id,
                name: plan.name,
                amount,
                currency: 'INR',
                billing_cycle,
            }
        });
    } catch(e) {
        console.error('[Payment] Initiate error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ─── POST /api/payment/simulate ───────────────────────────────────────────────
// Simulates a successful payment. In production, this is replaced by webhook verification.
router.post('/simulate', requireAuth, async (req, res) => {
    try {
        const { payment_id } = req.body;
        if (!payment_id) return res.status(400).json({ error: 'payment_id required' });

        const payment = db.prepare('SELECT * FROM payments WHERE payment_id = ? AND user_id = ?')
            .get(payment_id, req.user.id);
        if (!payment) return res.status(404).json({ error: 'Payment record not found' });
        if (payment.status !== 'pending') {
            return res.status(400).json({ error: `Payment already ${payment.status}` });
        }

        // Mark payment as completed
        const providerPaymentId = `sim_pay_${Date.now()}`;
        db.prepare(`
            UPDATE payments SET status = 'completed', provider_payment_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE payment_id = ?
        `).run(providerPaymentId, payment_id);

        // Increment promo code usage if applicable
        if (payment.metadata_json) {
            try {
                const meta = JSON.parse(payment.metadata_json);
                if (meta.promo_code) {
                    db.prepare('UPDATE promo_codes SET used_count = used_count + 1 WHERE code = ? COLLATE NOCASE').run(meta.promo_code);
                }
            } catch(e) {}
        }

        // Activate subscription
        const result = activateSubscription(req.user.id, payment.plan_id, payment.billing_cycle, payment_id);

        // Fetch the updated plan limits for immediate use on frontend
        const limits = db.prepare('SELECT * FROM plans WHERE id = ?').get(payment.plan_id);

        res.json({
            success: true,
            message: 'Subscription activated successfully',
            subscription: {
                id: result.subId,
                plan_id: payment.plan_id,
                status: result.status,
                expiry_date: result.expiryDate,
                billing_cycle: payment.billing_cycle,
            },
            limits,
        });
    } catch(e) {
        console.error('[Payment] Simulate error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ─── POST /api/payment/webhook ────────────────────────────────────────────────
// Webhook endpoint for real provider callbacks (Razorpay/Stripe).
// Signature verification is provider-specific.
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'] || req.headers['stripe-signature'];
        const provider = getProvider();

        // TODO: Implement real signature verification per provider
        // const isValid = provider.verifyPayment(req.body, signature);
        // if (!isValid) return res.status(400).json({ error: 'Invalid signature' });

        // Parse event — structure differs per provider
        const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        console.log('[Webhook] Event received:', event.event || event.type || 'unknown');

        // TODO: Handle specific event types:
        // Razorpay: payment.captured, subscription.activated, subscription.cancelled
        // Stripe: payment_intent.succeeded, customer.subscription.updated

        res.json({ received: true });
    } catch(e) {
        console.error('[Webhook] Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ─── GET /api/payment/history ─────────────────────────────────────────────────
// Returns the current user's payment history.
router.get('/history', requireAuth, (req, res) => {
    try {
        const payments = db.prepare(`
            SELECT p.*, pl.name as plan_name
            FROM payments p
            LEFT JOIN plans pl ON p.plan_id = pl.id
            WHERE p.user_id = ?
            ORDER BY p.created_at DESC
        `).all(req.user.id);

        res.json({ success: true, payments });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── GET /api/payment/plans ───────────────────────────────────────────────────
// Public endpoint: returns all plans with pricing (used by Upgrade page).
router.get('/plans', (req, res) => {
    try {
        let plans = db.prepare(`
            SELECT id, name, description, billing_type, price_monthly, price_yearly, price_lifetime,
                   ads_enabled, max_resolution, daily_downloads, daily_conversions, converter_access,
                   batch_download, playlist_download, priority_features, ad_free_experience,
                   youtube_enabled, instagram_enabled, facebook_enabled, mp3_enabled, mp4_enabled,
                   cloud_sync, multi_device_access, early_access_features, download_history_sync
            FROM plans ORDER BY CASE id WHEN 'free' THEN 1 WHEN 'premium' THEN 2 WHEN 'pro' THEN 3 WHEN 'lifetime' THEN 4 ELSE 5 END
        `).all();

        const ppe = db.prepare('SELECT value_json FROM app_settings WHERE key = "plan_premium_enabled"').get();
        const ppro = db.prepare('SELECT value_json FROM app_settings WHERE key = "plan_pro_enabled"').get();
        const plife = db.prepare('SELECT value_json FROM app_settings WHERE key = "plan_lifetime_enabled"').get();

        if (ppe && ppe.value_json === 'false') plans = plans.filter(p => p.id !== 'premium');
        if (ppro && ppro.value_json === 'false') plans = plans.filter(p => p.id !== 'pro');
        if (plife && plife.value_json === 'false') plans = plans.filter(p => p.id !== 'lifetime');

        res.json({ success: true, plans });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = { router, activateSubscription };
