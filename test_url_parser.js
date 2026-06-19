const URLParser = require('./js/url-parser.js');

const tests = [
    // Instagram
    { url: 'instagram.com/reel/C7-3u62vL9w/?igsh=MzRlODBiNWFlZA==', expectedType: 'instagram', shouldBeValid: true },
    { url: 'https://www.instagram.com/reel/C7-3u62vL9w/', expectedType: 'instagram', shouldBeValid: true },
    { url: 'https://instagram.com/p/C7-3u62vL9w/', expectedType: 'instagram', shouldBeValid: true },
    { url: 'https://instagram.com/tv/C7-3u62vL9w/', expectedType: 'instagram', shouldBeValid: true },
    { url: 'https://m.instagram.com/reel/C7-3u62vL9w/', expectedType: 'instagram', shouldBeValid: true },
    { url: 'https://www.instagram.com/', expectedType: 'instagram', shouldBeValid: false }, // No specific path
    
    // Facebook
    { url: 'facebook.com/reel/10153231379946729/?fbclid=IwAR2', expectedType: 'facebook', shouldBeValid: true },
    { url: 'https://www.facebook.com/watch/?v=10153231379946729', expectedType: 'facebook', shouldBeValid: true },
    { url: 'https://facebook.com/share/r/10153231379946729', expectedType: 'facebook', shouldBeValid: true },
    { url: 'https://m.facebook.com/watch/?v=123', expectedType: 'facebook', shouldBeValid: true },
    { url: 'https://fb.watch/abcd123/', expectedType: 'facebook', shouldBeValid: true },
    { url: 'https://www.facebook.com/', expectedType: 'facebook', shouldBeValid: false }, // No specific path
    
    // YouTube
    { url: 'youtube.com/watch?v=dQw4w9WgXcQ', expectedType: 'youtube', shouldBeValid: true },
    { url: 'https://youtu.be/dQw4w9WgXcQ?si=12345', expectedType: 'youtube', shouldBeValid: true }
];

let passed = 0;
console.log("=== URL Parsing Engine Test Suite ===\n");

tests.forEach(test => {
    const result = URLParser.detectPlatform(test.url);
    const isPass = (result.valid === test.shouldBeValid) && (!result.valid || result.type === test.expectedType);
    
    if (isPass) {
        passed++;
        console.log(`✅ PASS: ${test.url.substring(0, 40)}... -> [${result.type}] (Valid: ${result.valid})`);
        if (result.valid) console.log(`   Normalized: ${result.normalizedUrl}`);
    } else {
        console.log(`❌ FAIL: ${test.url}`);
        console.log(`   Expected Valid: ${test.shouldBeValid}, Expected Type: ${test.expectedType}`);
        console.log(`   Got Valid: ${result.valid}, Got Type: ${result.type}, Reason: ${result.reason}`);
    }
});

console.log(`\n=== Results: ${passed}/${tests.length} Passed ===`);
if (passed !== tests.length) {
    process.exit(1);
}
