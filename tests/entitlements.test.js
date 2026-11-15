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

// 3. Free Downloads Across All Qualities
console.log("Test 3: Unrestricted Video Downloads (No Sign-in / Desktop Pro requirement)");
assert.strictEqual(Entitlements.isDesktopProRequired('1080p', 'mp4'), false, '1080p must NOT require Desktop Pro');
assert.strictEqual(Entitlements.isDesktopProRequired('1440p', 'mp4'), false, '1440p must NOT require Desktop Pro');
assert.strictEqual(Entitlements.isDesktopProRequired('4K', 'mp4'), false, '4K must NOT require Desktop Pro');
assert.strictEqual(Entitlements.isDesktopProRequired('8K', 'mp4'), false, '8K must NOT require Desktop Pro');
console.log("  ✓ PASS: All video resolutions are free without Desktop Pro lock.");

// 4. Free User Access
console.log("Test 4: Guest and Free User Unrestricted Access");
const freeUser = { plan: 'free' };
assert.strictEqual(Entitlements.isDesktopProRequired('1080p', 'mp4', freeUser), false, 'Free user gets 1080p without login');
assert.strictEqual(Entitlements.isDesktopProRequired('4K', 'mp4', null), false, 'Guest user gets access without account');
console.log("  ✓ PASS: Free & guest download entitlement verified.");

console.log("\nALL ENTITLEMENT UNIT TESTS PASSED SUCCESSFULLY! ✓\n");
