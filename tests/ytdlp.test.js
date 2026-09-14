const path = require('path');
const fs = require('fs');
const ytDlpService = require('../services/ytDlpService');
// const systemService = require('../services/systemService');

const testUrls = [
  {
    name: "Standard YouTube Video",
    url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    shouldFail: false
  },
  {
    name: "YouTube Short URL (Auto-converted in routing normally, but here testing extraction)",
    url: "https://www.youtube.com/shorts/5-sfG8DdFAA",
    shouldFail: false
  },
  {
    name: "Age-Restricted Video",
    url: "https://www.youtube.com/watch?v=YykjpeuMNEk",
    shouldFail: false // Assuming we have some fallback or at least we test the behavior
  },
  {
    name: "Known Invalid URL",
    url: "https://www.youtube.com/watch?v=INVALID_ID_123",
    shouldFail: true
  }
];

const runTests = async () => {
  console.log("Starting yt-dlp tests...\n");

  let ytDlpPath = process.platform === 'win32' 
      ? path.join(__dirname, '..', 'bin', 'yt-dlp.exe') 
      : path.join(__dirname, '..', 'bin', 'yt-dlp');
      
  if (ytDlpPath.includes('app.asar')) {
      ytDlpPath = ytDlpPath.replace('app.asar', 'app.asar.unpacked');
  }
  if (!fs.existsSync(ytDlpPath)) {
      ytDlpPath = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  }

  for (const testCase of testUrls) {
    console.log(`=========================================`);
    console.log(`Testing: ${testCase.name}`);
    console.log(`URL: ${testCase.url}`);
    
    // Convert short URL if needed (mimicking server.js behavior)
    let targetUrl = testCase.url;
    if (targetUrl.includes('/shorts/')) {
       targetUrl = targetUrl.replace('/shorts/', '/watch?v=');
       console.log(`Converted URL: ${targetUrl}`);
    }

    const baseArgs = ['--dump-json', targetUrl];
    
    try {
      const result = await ytDlpService.fetchWithRetryAndFallback(ytDlpPath, baseArgs);
      
      if (testCase.shouldFail) {
        console.error(`❌ FAILED: Expected test to fail, but it succeeded.`);
      } else {
        const metadata = JSON.parse(result.stdout);
        console.log(`✅ SUCCESS: Retrieved metadata for "${metadata.title}"`);
      }
    } catch (err) {
      if (testCase.shouldFail) {
        console.log(`✅ SUCCESS: Test failed as expected. Known error: ${err.knownError || 'None'} / Error msg: ${err.stderr ? err.stderr.substring(0, 100) : err.message}`);
      } else {
        console.error(`❌ FAILED: Unexpected error.`);
        console.error(`   Known Error: ${err.knownError || 'None'}`);
        console.error(`   Stderr snippet: ${err.stderr ? err.stderr.substring(0, 200) : 'None'}`);
      }
    }
    console.log(`\n`);
  }
};

runTests().catch(err => {
  console.error("Test runner crashed:", err);
});
