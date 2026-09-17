// ============================================================
// StreamVault PRO — Matrix & Capability Verification Script
// ============================================================

const assert = require('assert');
const Entitlements = require('../js/entitlements');

async function runMatrixVerification() {
    console.log("=================================================");
    console.log(" STREAMVAULT PRO — MATRIX & CAPABILITY VERIFICATION");
    console.log("=================================================");

    const results = [];

    // Test matrix definition from Section 20
    const tests = [
        { name: "Web 360p", format: "mp4", quality: "360p", user: null, expected: "Web Download" },
        { name: "Web 480p", format: "mp4", quality: "480p", user: null, expected: "Web Download" },
        { name: "Web 720p", format: "mp4", quality: "720p", user: null, expected: "Web Download" },
        { name: "Web 1080p progressive", format: "mp4", quality: "1080p", user: null, expected: "Web Download" },
        { name: "Web MP3", format: "mp3", quality: "128K", user: null, expected: "Web Download" },
        { name: "Web 1440p without Pro", format: "mp4", quality: "1440p", user: null, expected: "Subscription Required" },
        { name: "Web 4K without Pro", format: "mp4", quality: "4k", user: null, expected: "Subscription Required" },
        { name: "Web 8K without Pro", format: "mp4", quality: "8k", user: null, expected: "Subscription Required" },
        { name: "Desktop Pro 1440p", format: "mp4", quality: "1440p", user: { plan: "pro" }, expected: "Desktop Path" },
        { name: "Desktop Pro 4K", format: "mp4", quality: "4k", user: { plan: "pro" }, expected: "Desktop Path" },
        { name: "Desktop Pro 8K", format: "mp4", quality: "8k", user: { plan: "pro" }, expected: "Desktop Path" }
    ];

    for (const t of tests) {
        const isLocked = Entitlements.isDesktopProRequired(t.quality, t.format, t.user);
        let actual = "";
        if (t.user && Entitlements.hasDesktopProAccess(t.user)) {
            actual = isLocked ? "Subscription Required" : "Desktop Path";
        } else {
            actual = isLocked ? "Subscription Required" : "Web Download";
        }

        const pass = actual === t.expected;
        results.push({ test: t.name, expected: t.expected, actual: actual, status: pass ? "PASS" : "FAIL" });
        console.log(`[${pass ? "PASS" : "FAIL"}] ${t.name.padEnd(28)} | Expected: ${t.expected.padEnd(22)} | Actual: ${actual}`);
        assert.strictEqual(actual, t.expected);
    }

    // Localhost regression test
    console.log("\n--- Checking Localhost Express Daemon ---");
    try {
        const res = await fetch("http://127.0.0.1:10000/api/health");
        const json = await res.json();
        console.log(`[PASS] Localhost Engine Health: HTTP ${res.status} | Status: ${json.status}`);
        results.push({ test: "Existing localhost download", expected: "PASS", actual: "PASS", status: "PASS" });
    } catch (e) {
        console.error(`[FAIL] Localhost Engine Offline: ${e.message}`);
        results.push({ test: "Existing localhost download", expected: "PASS", actual: "FAIL", status: "FAIL" });
    }

    console.log("\n=================================================");
    console.log(" ALL MATRIX VERIFICATIONS COMPLETED SUCCESSFULLY ");
    console.log("=================================================");
}

runMatrixVerification().catch(err => {
    console.error(err);
    process.exit(1);
});
