const { spawn, execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const logger = require('./logger');
const systemService = require('./systemService');
const cookieValidator = require('./cookieValidator');
const fluentFfmpeg = require('fluent-ffmpeg');

let ffprobePath;
let ffprobePathDir = '';
try {
    ffprobePath = require('@ffprobe-installer/ffprobe').path;
    if (ffprobePath.includes('app.asar')) ffprobePath = ffprobePath.replace('app.asar', 'app.asar.unpacked');
    ffprobePathDir = path.dirname(ffprobePath);
    fluentFfmpeg.setFfprobePath(ffprobePath);
} catch (err) {
    // ignore
}

let ffmpegPathDir = '';
try {
    let p = require('@ffmpeg-installer/ffmpeg').path;
    if (p.includes('app.asar')) p = p.replace('app.asar', 'app.asar.unpacked');
    ffmpegPathDir = path.dirname(p);
} catch (err) {
    // ignore
}

const getAugmentedEnv = () => {
    const env = Object.assign({}, process.env);
    const dirs = [];
    if (ffmpegPathDir) dirs.push(ffmpegPathDir);
    if (ffprobePathDir) dirs.push(ffprobePathDir);
    if (dirs.length > 0) {
        env.PATH = dirs.join(path.delimiter) + path.delimiter + (env.PATH || '');
    }
    return env;
};

const verifyMediaIntegrity = (filePath) => {
    return new Promise((resolve, reject) => {
        fluentFfmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(new Error(`ffprobe error: ${err.message}`));
            if (!metadata || !metadata.format) return reject(new Error('No metadata found'));
            
            const format = metadata.format;
            if (!format.duration || format.duration <= 0) {
                return reject(new Error('Duration is 0 or missing (possible corrupt file or missing moov atom)'));
            }
            
            let hasVideo = false;
            let hasAudio = false;
            if (metadata.streams) {
                for (const stream of metadata.streams) {
                    if (stream.codec_type === 'video') hasVideo = true;
                    if (stream.codec_type === 'audio') hasAudio = true;
                }
            }
            if (!hasVideo && !hasAudio) {
                return reject(new Error('No video or audio stream found'));
            }
            resolve(true);
        });
    });
};


// Parse known YouTube errors
const parseError = (stderr) => {
  if (!stderr) return null;
  const errLower = stderr.toLowerCase();
  
  if (errLower.includes("sign in to confirm you're not a bot")) {
    return 'YouTube requires sign-in to confirm you are not a bot. Please use browser cookies.';
  }
  if (errLower.includes('the page needs to be reloaded')) {
    return 'YouTube page reloaded error. This is usually caused by outdated cookies. Try updating them or using a different browser for cookies.';
  }
  if (errLower.includes('http error 429') || errLower.includes('too many requests')) {
    return 'YouTube rate limit exceeded (HTTP 429). Please wait a while before trying again.';
  }
  if (errLower.includes('video unavailable') || errLower.includes('private video')) {
    return 'The video is unavailable or private.';
  }
  if (errLower.includes('members-only content')) {
    return 'This video is members-only content. Valid cookies for a subscribed account are required.';
  }
  if (errLower.includes('age-restricted')) {
    return 'This video is age-restricted. You must use cookies from a signed-in adult account.';
  }
  if (errLower.includes('invalid cookies') || errLower.includes('cookie is invalid')) {
    return 'Invalid cookies.';
  }
  if (errLower.includes('expired cookies') || errLower.includes('cookie is expired')) {
    return 'Expired cookies.';
  }
  if (errLower.includes('region blocked') || errLower.includes('not available in your country')) {
    return 'Region blocked.';
  }
  if (errLower.includes('removed video') || errLower.includes('video has been removed')) {
    return 'Removed video.';
  }
  if (errLower.includes('youtube api change') || errLower.includes('extractor error')) {
    return 'YouTube API change.';
  }
  if (errLower.includes('network timeout') || errLower.includes('timed out') || errLower.includes('timeout')) {
    return 'Network timeout.';
  }
  if (errLower.includes('operation not permitted') && errLower.includes('safari')) {
    return 'Safari cookies cannot be read due to macOS permissions (Full Disk Access required).';
  }
  
  return null; // No known error detected
};

const injectGlobalHeaders = (args) => {
  const newArgs = [...args];
  
  const headers = [
    { key: '--user-agent', value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36" },
    { key: '--add-header', value: "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    { key: '--add-header', value: "Accept-Language: en-US,en;q=0.5" }
  ];

  for (const header of headers) {
    if (!newArgs.includes(header.key) || (header.key === '--add-header' && !newArgs.some(a => a === header.value))) {
      newArgs.unshift(header.key, header.value);
    }
  }
  

  if (!newArgs.includes('--js-runtimes')) {
    newArgs.unshift('--js-runtimes', 'node');
  }
  
  if (!newArgs.includes('--remote-components')) {
    newArgs.unshift('--remote-components', 'ejs:github');
  }

  if (!newArgs.includes('--extractor-args')) {
    newArgs.push('--extractor-args', 'youtube:player_client=android,web');
  }
  
  return newArgs;
};

const getBaseYtDlpArgs = () => {
  return [
    '-v',
    '--no-check-certificate',
    '--geo-bypass',
    '--legacy-server-connect'
  ];
};

const executeYtDlp = async (ytDlpPath, args) => {
  const processArgs = injectGlobalHeaders(args);
  
  return new Promise((resolve, reject) => {
    // Print the COMPLETE yt-dlp command before execution
    logger.info(`[executeYtDlp] COMPLETE COMMAND: ${ytDlpPath} ${processArgs.join(' ')}`);
    
    const ytDlp = spawn(ytDlpPath, processArgs, { env: getAugmentedEnv() });
    let stdout = '';
    let stderr = '';

    ytDlp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ytDlp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ytDlp.on('close', (code) => {
      logger.info(`[executeYtDlp] COMPLETE STDOUT:\n${stdout}\n[executeYtDlp] COMPLETE STDERR:\n${stderr}`);
      if (code === 0) {
         resolve({ stdout, stderr });
      } else {
         const knownError = parseError(stderr);
         reject({ code, stdout, stderr, knownError, finalArgs: processArgs });
      }
    });

    ytDlp.on('error', (err) => {
       logger.error(`[executeYtDlp] SPAWN ERROR:\n${err.message}`);
       reject({ code: -1, stdout, stderr, error: err.message, finalArgs: processArgs });
    });
  });
};

const fetchWithRetryAndFallback = async (ytDlpPath, baseArgs) => {
  const cookieStrategies = [];

  cookieStrategies.push({ type: 'none', value: null });

  const cookiesPath = path.join(process.cwd(), 'cookies.txt');
  if (cookieValidator.validateCookiesTxt(cookiesPath)) {
    cookieStrategies.push({ type: 'file', value: cookiesPath });
  }

  const installedBrowsers = systemService.getInstalledBrowsers();
  if (installedBrowsers.length > 0) {
    installedBrowsers.forEach(b => cookieStrategies.push({ type: 'browser', value: b }));
  }

  let lastError = null;

  for (let i = 0; i < cookieStrategies.length; i++) {
    const strategy = cookieStrategies[i];
    
    // Filter out any previously added cookie args
    let attemptArgs = baseArgs.filter((a, idx, arr) => 
      a !== '--cookies-from-browser' && a !== '--cookies' && 
      (idx === 0 || (arr[idx-1] !== '--cookies-from-browser' && arr[idx-1] !== '--cookies'))
    );
    
    if (strategy.type === 'file') {
      attemptArgs.push('--cookies', strategy.value);
    } else if (strategy.type === 'browser') {
      attemptArgs.push('--cookies-from-browser', strategy.value);
    }
    
    try {
      logger.info(`Starting yt-dlp execution (Cookie Attempt ${i + 1}/${cookieStrategies.length}): ${strategy.value || 'No cookies'}`);
      const result = await executeYtDlp(ytDlpPath, attemptArgs);
      logger.info(`Execution successful on attempt ${i + 1} (${strategy.value || 'No cookies'})`);
      result.finalArgs = attemptArgs;
      return result;
    } catch (err) {
      logger.error(`Execution failed on attempt ${i + 1} (${strategy.value || 'No cookies'})`);
      logger.error(`STDERR: ${err.stderr}`);
      lastError = err;
      
      if (err.knownError) {
         logger.warn(`Parsed known error: ${err.knownError}`);
      }

      if (i === cookieStrategies.length - 1) {
        throw lastError; // Throw full exception to identify the exact HTTP 403 request
      }

      const delay = Math.pow(2, i + 1) * 1000;
      logger.info(`Waiting ${delay}ms before next fallback...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
  
  throw lastError || new Error("All attempts failed.");
};

const downloadWithRetryAndFallback = async (ytDlpPath, baseArgs, onSpawn) => {
  const cookieStrategies = [];

  cookieStrategies.push({ type: 'none', value: null });

  const cookiesPath = path.join(process.cwd(), 'cookies.txt');
  if (cookieValidator.validateCookiesTxt(cookiesPath)) {
    cookieStrategies.push({ type: 'file', value: cookiesPath });
  }

  const installedBrowsers = systemService.getInstalledBrowsers();
  if (installedBrowsers.length > 0) {
    installedBrowsers.forEach(b => cookieStrategies.push({ type: 'browser', value: b }));
  }

  let lastError = null;

  for (let i = 0; i < cookieStrategies.length; i++) {
    const strategy = cookieStrategies[i];
    
    let attemptArgs = baseArgs.filter((a, idx, arr) => 
      a !== '--cookies-from-browser' && a !== '--cookies' && 
      (idx === 0 || (arr[idx-1] !== '--cookies-from-browser' && arr[idx-1] !== '--cookies'))
    );
    
    if (strategy.type === 'file') {
      attemptArgs.push('--cookies', strategy.value);
    } else if (strategy.type === 'browser') {
      attemptArgs.push('--cookies-from-browser', strategy.value);
    }
    
    const processArgs = injectGlobalHeaders(attemptArgs);

    try {
      logger.info(`Starting yt-dlp stream (Cookie Attempt ${i + 1}/${cookieStrategies.length}): ${strategy.value || 'No cookies'}`);
      // Print the COMPLETE yt-dlp command before execution
      logger.info(`[downloadWithRetryAndFallback] COMPLETE COMMAND: ${ytDlpPath} ${processArgs.join(' ')}`);
      
      const result = await new Promise((resolve, reject) => {
        const ytDlp = spawn(ytDlpPath, processArgs, { env: getAugmentedEnv() });
        
        let stderr = '';
        let stdout = '';
        let resolved = false;

        // Pass the spawned process back to the caller to attach their stream handlers
        const handlers = onSpawn(ytDlp, attemptArgs);

        ytDlp.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        ytDlp.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        ytDlp.on('close', (code) => {
          logger.info(`[downloadWithRetryAndFallback] COMPLETE STDOUT:\n${stdout}\n[downloadWithRetryAndFallback] COMPLETE STDERR:\n${stderr}`);
          if (code === 0) {
             const destIdx = attemptArgs.indexOf('-o');
             const destPath = destIdx !== -1 ? attemptArgs[destIdx + 1] : null;

             if (destPath) {
                 if (fs.existsSync(destPath)) {
                     verifyMediaIntegrity(destPath).then(() => {
                         if (!resolved) { resolved = true; resolve({ stdout, stderr, finalArgs: attemptArgs }); }
                     }).catch(verifyErr => {
                         const knownError = 'Validation failed: ' + verifyErr.message;
                         if (!resolved) { resolved = true; reject({ code: -2, stdout, stderr, knownError, finalArgs: attemptArgs }); }
                     });
                 } else {
                     const knownError = 'Validation failed: Output file was not created';
                     if (!resolved) { resolved = true; reject({ code: -2, stdout, stderr, knownError, finalArgs: attemptArgs }); }
                 }
             } else {
                 if (!resolved) { resolved = true; resolve({ stdout, stderr, finalArgs: attemptArgs }); }
             }
          } else {
            const knownError = parseError(stderr);
            if (!resolved) { resolved = true; reject({ code, stdout, stderr, knownError, finalArgs: processArgs }); }
          }
        });

        ytDlp.on('error', (err) => {
          logger.error(`[downloadWithRetryAndFallback] SPAWN ERROR:\n${err.message}`);
          if (!resolved) { resolved = true; reject({ code: -1, stdout, stderr, error: err.message, finalArgs: processArgs }); }
        });
        
        // If the onSpawn returned a promise (e.g. tracking when headers are received), 
        // we can handle it here, but typically download stream just waits for close.
        if (handlers && handlers.abortSignal) {
          handlers.abortSignal.on('abort', () => {
             ytDlp.kill('SIGTERM');
             if (!resolved) { resolved = true; resolve({ aborted: true }); }
          });
        }
      });
      
      if (result.aborted) {
         logger.info(`Stream aborted successfully.`);
         return result; 
      }

      logger.info(`Stream completed successfully on attempt ${i + 1} (${strategy.value || 'No cookies'})`);
      return result;
    } catch (err) {
      logger.error(`Stream failed on attempt ${i + 1} (${strategy.value || 'No cookies'})`);
      logger.error(`STDERR: ${err.stderr}`);
      lastError = err;
      
      if (err.knownError) {
         logger.warn(`Parsed known error: ${err.knownError}`);
      }

      // Cleanup corrupted output file before retry
      const destIdx = attemptArgs.indexOf('-o');
      const destPath = destIdx !== -1 ? attemptArgs[destIdx + 1] : null;
      if (destPath && fs.existsSync(destPath)) {
         try { fs.unlinkSync(destPath); } catch (e) {}
      }
      
      if (i === cookieStrategies.length - 1) {
        throw lastError; // Throw full exception to identify the exact HTTP 403 request
      }

      const delay = Math.pow(2, i + 1) * 1000;
      logger.info(`Waiting ${delay}ms before next fallback...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
  
  throw lastError || new Error("All attempts failed.");
};

const spawnYtDlp = async (ytDlpPath, args) => {
  const processArgs = injectGlobalHeaders(args);
  logger.info(`[spawnYtDlp] COMPLETE COMMAND: ${ytDlpPath} ${processArgs.join(' ')}`);
  return spawn(ytDlpPath, processArgs);
};

const execYtDlpSync = (ytDlpPath, args) => {
  return execSync(`"${ytDlpPath}" ${args.join(' ')}`, {stdio: 'pipe'});
};

module.exports = {
  executeYtDlp,
  fetchWithRetryAndFallback,
  downloadWithRetryAndFallback,
  spawnYtDlp,
  execYtDlpSync,
  parseError,
  getBaseYtDlpArgs
};
