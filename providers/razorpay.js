/**
 * StreamVault PRO — Razorpay Payment Adapter
 * 
 * TODO: To activate Razorpay:
 *   1. npm install razorpay
 *   2. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env
 *   3. Uncomment the Razorpay SDK calls below
 */

// const Razorpay = require('razorpay');
// const razorpayInstance = new Razorpay({
//     key_id: process.env.RAZORPAY_KEY_ID,
//     key_secret: process.env.RAZORPAY_KEY_SECRET,
// });

const PROVIDER_NAME = 'razorpay';

/**
 * Creates a Razorpay order for the given amount.
 * @param {number} amount - Amount in paise (INR smallest unit, e.g. 9900 = ₹99)
 * @param {string} currency - Currency code (default: INR)
 * @param {string} receipt - Unique receipt ID (payment_id)
 * @returns {Promise<{order_id: string, currency: string, amount: number}>}
 */
async function createOrder(amount, currency = 'INR', receipt) {
    // TODO: Replace with real Razorpay call:
    // const order = await razorpayInstance.orders.create({ amount, currency, receipt });
    // return { order_id: order.id, currency: order.currency, amount: order.amount };
    
    // STUB: Returns a simulated order object
    return {
        provider: PROVIDER_NAME,
        order_id: `rp_order_${Date.now()}`,
        currency,
        amount,
        receipt,
        key_id: 'rzp_test_STUB_KEY', // Frontend needs this to open Razorpay checkout
    };
}

/**
 * Verifies Razorpay payment signature after checkout completes.
 * @param {string} order_id - Razorpay order ID
 * @param {string} payment_id - Razorpay payment ID
 * @param {string} signature - HMAC signature from Razorpay
 * @returns {boolean}
 */
function verifyPayment(order_id, payment_id, signature) {
    // TODO: Replace with real verification:
    // const crypto = require('crypto');
    // const body = order_id + '|' + payment_id;
    // const expectedSig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(body).digest('hex');
    // return expectedSig === signature;
    
    // STUB: Always returns true in simulation
    return true;
}

/**
 * Issues a refund for a completed payment.
 * @param {string} payment_id - Razorpay payment ID to refund
 * @param {number} amount - Amount in paise (partial or full)
 */
async function refund(payment_id, amount) {
    // TODO: Replace with real refund:
    // return await razorpayInstance.payments.refund(payment_id, { amount });
    
    return { refund_id: `rp_refund_${Date.now()}`, status: 'stub_refunded' };
}

module.exports = { PROVIDER_NAME, createOrder, verifyPayment, refund };
