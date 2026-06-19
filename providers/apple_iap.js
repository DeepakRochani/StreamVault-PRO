/**
 * StreamVault PRO — Apple In-App Purchase Adapter
 *
 * TODO: To activate Apple IAP:
 *   1. npm install apple-receipt-verify OR node-apple-receipt-verify
 *   2. Set APPLE_SHARED_SECRET in .env
 *   3. Configure product IDs in App Store Connect
 */

const PROVIDER_NAME = 'apple_iap';

/**
 * Validates an Apple IAP receipt sent from the iOS app.
 * @param {string} receiptData - Base64-encoded receipt from StoreKit
 * @param {boolean} sandbox - Whether to use Apple sandbox environment
 */
async function verifyReceipt(receiptData, sandbox = false) {
    // TODO: Replace with real Apple receipt verification:
    // const verifyUrl = sandbox
    //   ? 'https://sandbox.itunes.apple.com/verifyReceipt'
    //   : 'https://buy.itunes.apple.com/verifyReceipt';
    // const response = await fetch(verifyUrl, {
    //   method: 'POST',
    //   body: JSON.stringify({ 'receipt-data': receiptData, password: process.env.APPLE_SHARED_SECRET }),
    // });
    // const data = await response.json();
    // return data.status === 0;
    
    return { verified: true, provider: PROVIDER_NAME };
}

async function createOrder(amount, currency = 'INR', receipt) {
    // Apple IAP prices are managed in App Store Connect; orders initiated in-app via StoreKit
    return { provider: PROVIDER_NAME, order_id: `ap_${Date.now()}`, note: 'Apple IAP order managed in-app via StoreKit' };
}

function verifyPayment(receipt) {
    return true; // Stub
}

async function refund(transactionId) {
    // Apple refunds are handled by Apple; cannot be issued via API directly
    return { status: 'contact_apple_support', note: 'Apple does not provide a direct refund API' };
}

module.exports = { PROVIDER_NAME, createOrder, verifyPayment, verifyReceipt, refund };
