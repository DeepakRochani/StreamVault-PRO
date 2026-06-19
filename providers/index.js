/**
 * StreamVault PRO — Payment Provider Factory
 *
 * To switch payment providers, change the ACTIVE_PROVIDER constant.
 * All providers implement the same interface: createOrder, verifyPayment, refund
 */

const ACTIVE_PROVIDER = process.env.PAYMENT_PROVIDER || 'razorpay';

const providers = {
    razorpay:   require('./razorpay'),
    stripe:     require('./stripe'),
    google_play: require('./google_play'),
    apple_iap:  require('./apple_iap'),
};

/**
 * Returns the active payment provider adapter.
 * @param {string} [name] - Override provider name (optional)
 * @returns {{ createOrder, verifyPayment, refund, PROVIDER_NAME }}
 */
function getProvider(name) {
    const key = name || ACTIVE_PROVIDER;
    if (!providers[key]) {
        throw new Error(`Unknown payment provider: ${key}. Valid options: ${Object.keys(providers).join(', ')}`);
    }
    return providers[key];
}

module.exports = { getProvider, ACTIVE_PROVIDER, providers };
