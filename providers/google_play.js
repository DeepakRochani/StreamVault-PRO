/**
 * StreamVault PRO — Google Play Billing Adapter
 *
 * TODO: To activate Google Play Billing:
 *   1. npm install google-auth-library googleapis
 *   2. Set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON in .env
 *   3. Configure product IDs in Google Play Console
 */

const PROVIDER_NAME = 'google_play';

/**
 * Validates a Google Play purchase token sent from the Android app.
 * @param {string} packageName - App package name
 * @param {string} productId - In-app product ID (e.g. 'streamvault_premium_monthly')
 * @param {string} purchaseToken - Token received after purchase in app
 */
async function verifyPurchase(packageName, productId, purchaseToken) {
    // TODO: Replace with real Google Play verification:
    // const { google } = require('googleapis');
    // const auth = new google.auth.GoogleAuth({ ... });
    // const androidPublisher = google.androidpublisher({ version: 'v3', auth });
    // const result = await androidPublisher.purchases.products.get({ packageName, productId, token: purchaseToken });
    // return result.data.purchaseState === 0; // 0 = purchased
    
    return { verified: true, provider: PROVIDER_NAME, purchaseToken };
}

async function createOrder(amount, currency = 'INR', receipt) {
    // Google Play manages pricing in Play Console; orders are initiated in-app
    return { provider: PROVIDER_NAME, order_id: `gp_${Date.now()}`, note: 'Google Play order managed in-app' };
}

function verifyPayment(token) {
    return true; // Stub
}

async function refund(orderId) {
    // TODO: Use Google Play API to void purchase
    return { status: 'stub_refunded' };
}

module.exports = { PROVIDER_NAME, createOrder, verifyPayment, verifyPurchase, refund };
