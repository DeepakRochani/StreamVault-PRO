/**
 * StreamVault PRO — Stripe Payment Adapter
 *
 * TODO: To activate Stripe:
 *   1. npm install stripe
 *   2. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in .env
 *   3. Uncomment the Stripe SDK calls below
 */

// const Stripe = require('stripe');
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PROVIDER_NAME = 'stripe';

/**
 * Creates a Stripe PaymentIntent.
 * @param {number} amount - Amount in paise/cents (smallest currency unit)
 * @param {string} currency - Currency code e.g. 'inr', 'usd'
 * @param {string} receipt - Unique receipt/payment_id for metadata
 */
async function createOrder(amount, currency = 'inr', receipt) {
    // TODO: Replace with real Stripe call:
    // const paymentIntent = await stripe.paymentIntents.create({
    //     amount, currency, metadata: { receipt },
    //     automatic_payment_methods: { enabled: true },
    // });
    // return { order_id: paymentIntent.id, client_secret: paymentIntent.client_secret, currency, amount };
    
    return {
        provider: PROVIDER_NAME,
        order_id: `pi_stub_${Date.now()}`,
        client_secret: `pi_stub_secret_${Date.now()}`,
        currency,
        amount,
        receipt,
    };
}

/**
 * Verifies a Stripe webhook event signature.
 * @param {Buffer} payload - Raw request body buffer
 * @param {string} sig - Stripe-Signature header value
 */
function verifyPayment(payload, sig) {
    // TODO: Replace with real Stripe webhook verification:
    // const event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);
    // return event;
    
    return true;
}

/**
 * Issues a Stripe refund.
 * @param {string} payment_intent_id - Stripe PaymentIntent ID
 * @param {number} amount - Amount in cents/paise
 */
async function refund(payment_intent_id, amount) {
    // TODO: Replace with real Stripe call:
    // return await stripe.refunds.create({ payment_intent: payment_intent_id, amount });
    
    return { id: `re_stub_${Date.now()}`, status: 'stub_refunded' };
}

module.exports = { PROVIDER_NAME, createOrder, verifyPayment, refund };
