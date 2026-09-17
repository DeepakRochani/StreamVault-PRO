// ============================================================
// StreamVault PRO — Entitlements & Capabilities Unit Tests
// ============================================================

const assert = require('assert');
const Entitlements = require('../js/entitlements');

console.log("=== RUNNING ENTITLEMENTS UNIT TEST SUITE ===");

// 1. Web Capabilities Baseline
console.log("Test 1: Web Supported Video Qualities (Up to 1080p)");
assert.strictEqual(Entitlements.WEB_MAX_VIDEO_QUALITY, '1080p');
assert.strictEqual(Entitlements.isDesktopProRequired('360p', 'mp4'), false, '360p should be supported on Web');
assert.strictEqual(Entitlements.isDesktopProRequired('480p', 'mp4'), false, '480p should be supported on Web');
assert.strictEqual(Entitlements.isDesktopProRequired('720p', 'mp4'), false, '720p should be supported on Web');
assert.strictEqual(Entitlements.isDesktopProRequired('1080p', 'mp4'), false, '1080p MUST be supported on Web');
assert.strictEqual(Entitlements.isDesktopProRequired('Original', 'mp4'), false, 'Original stream selection should be supported on Web');
assert.strictEqual(Entitlements.isDesktopProRequired('best', 'mp4'), false, 'Best stream selection should be supported on Web');
console.log("  ✓ PASS: 360p, 480p, 720p, 1080p are Web-supported.");

// 2. Audio Web Capabilities
console.log("Test 2: Web Supported Audio Formats (MP3)");
assert.strictEqual(Entitlements.isDesktopProRequired('128K', 'mp3'), false, 'MP3 128k should be supported on Web');
assert.strictEqual(Entitlements.isDesktopProRequired('192K', 'mp3'), false, 'MP3 192k should be supported on Web');
assert.strictEqual(Entitlements.isDesktopProRequired('320K', 'mp3'), false, 'MP3 320k should be supported on Web');
assert.strictEqual(Entitlements.isDesktopProRequired('640K', 'audio'), false, 'Audio 640k should be supported on Web');
console.log("  ✓ PASS: MP3 audio formats are Web-supported.");

// 3. Desktop Pro Locked Qualities on Web
console.log("Test 3: Desktop Pro Premium Video Qualities (1440p, 4K, 8K)");
assert.strictEqual(Entitlements.isDesktopProRequired('1440p', 'mp4'), true, '1440p must require Desktop Pro on Web');
assert.strictEqual(Entitlements.isDesktopProRequired('2160p', 'mp4'), true, '2160p must require Desktop Pro on Web');
assert.strictEqual(Entitlements.isDesktopProRequired('4K', 'mp4'), true, '4K must require Desktop Pro on Web');
assert.strictEqual(Entitlements.isDesktopProRequired('4320p', 'mp4'), true, '4320p must require Desktop Pro on Web');
assert.strictEqual(Entitlements.isDesktopProRequired('8k', 'mp4'), true, '8K must require Desktop Pro on Web');
console.log("  ✓ PASS: 1440p, 4K, 8K correctly require Desktop Pro for non-pro Web users.");

// 4. Desktop Pro User Entitlement Bypass
console.log("Test 4: Pro / Subscribed User Access");
const proUser = { plan: 'pro', role: 'user' };
assert.strictEqual(Entitlements.hasDesktopProAccess(proUser), true, 'Pro plan user should have Desktop Pro access');
assert.strictEqual(Entitlements.isDesktopProRequired('4K', 'mp4', proUser), false, 'Pro user should not be locked out of 4K');
assert.strictEqual(Entitlements.isDesktopProRequired('8K', 'mp4', proUser), false, 'Pro user should not be locked out of 8K');

const lifetimeUser = { subscription: { plan_id: 'lifetime' } };
assert.strictEqual(Entitlements.hasDesktopProAccess(lifetimeUser), true, 'Lifetime plan user should have Desktop Pro access');
assert.strictEqual(Entitlements.isDesktopProRequired('4K', 'mp4', lifetimeUser), false, 'Lifetime user should unlock 4K');

const freeUser = { plan: 'free' };
assert.strictEqual(Entitlements.hasDesktopProAccess(freeUser), false, 'Free user should not have Desktop Pro access');
assert.strictEqual(Entitlements.isDesktopProRequired('1080p', 'mp4', freeUser), false, 'Free user gets Web 1080p');
assert.strictEqual(Entitlements.isDesktopProRequired('4K', 'mp4', freeUser), true, 'Free user is locked out of 4K');
console.log("  ✓ PASS: Plan-based entitlement gating functions correctly.");

console.log("\nALL ENTITLEMENT UNIT TESTS PASSED SUCCESSFULLY! ✓\n");
