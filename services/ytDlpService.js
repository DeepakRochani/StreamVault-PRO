const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const logger = require('./logger');
const systemService = require('./systemService');

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
  const pythonCmd = await systemService.getPythonCommand();
  const processArgs = [ytDlpPath, ...injectGlobalHeaders(args)];
  
  return new Promise((resolve, reject) => {
    // Print the COMPLETE yt-dlp command before execution
    logger.info(`[executeYtDlp] COMPLETE COMMAND: ${pythonCmd} ${processArgs.join(' ')}`);
    
    const ytDlp = spawn(pythonCmd, processArgs);
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
  const installedBrowsers = systemService.getInstalledBrowsers();
  const browsers = installedBrowsers.length > 0 ? installedBrowsers : [null];
  let lastError = null;

  for (let i = 0; i < browsers.length; i++) {
    const browser = browsers[i];
    
    // Filter out any previously added --cookies-from-browser pairs
    let attemptArgs = baseArgs.filter((a, idx, arr) => 
      a !== '--cookies-from-browser' && (idx === 0 || arr[idx-1] !== '--cookies-from-browser')
    );
    if (browser) {
      attemptArgs.push('--cookies-from-browser', browser);
    }
    
    try {
      logger.info(`Starting yt-dlp execution (Browser Attempt ${i + 1}/${browsers.length}): ${browser || 'No cookies'}`);
      const result = await executeYtDlp(ytDlpPath, attemptArgs);
      logger.info(`Execution successful on attempt ${i + 1} (${browser || 'No cookies'})`);
      result.finalArgs = attemptArgs;
      return result;
    } catch (err) {
      logger.error(`Execution failed on attempt ${i + 1} (${browser || 'No cookies'})`);
      logger.error(`STDERR: ${err.stderr}`);
      lastError = err;
      
      if (err.knownError) {
         logger.warn(`Parsed known error: ${err.knownError}`);
      }

      if (i === browsers.length - 1) {
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
  const installedBrowsers = systemService.getInstalledBrowsers();
  const browsers = installedBrowsers.length > 0 ? installedBrowsers : [null];
  const pythonCmd = await systemService.getPythonCommand();
  let lastError = null;

  for (let i = 0; i < browsers.length; i++) {
    const browser = browsers[i];
    
    let attemptArgs = baseArgs.filter((a, idx, arr) => 
      a !== '--cookies-from-browser' && (idx === 0 || arr[idx-1] !== '--cookies-from-browser')
    );
    if (browser) {
      attemptArgs.push('--cookies-from-browser', browser);
    }
    
    const processArgs = [ytDlpPath, ...injectGlobalHeaders(attemptArgs)];

    try {
      logger.info(`Starting yt-dlp stream (Browser Attempt ${i + 1}/${browsers.length}): ${browser || 'No cookies'}`);
      // Print the COMPLETE yt-dlp command before execution
      logger.info(`[downloadWithRetryAndFallback] COMPLETE COMMAND: ${pythonCmd} ${processArgs.join(' ')}`);
      
      const result = await new Promise((resolve, reject) => {
        const ytDlp = spawn(pythonCmd, processArgs);
        
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
            if (!resolved) { resolved = true; resolve({ stdout, stderr, finalArgs: attemptArgs }); }
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

      logger.info(`Stream completed successfully on attempt ${i + 1} (${browser || 'No cookies'})`);
      return result;
    } catch (err) {
      logger.error(`Stream failed on attempt ${i + 1} (${browser || 'No cookies'})`);
      logger.error(`STDERR: ${err.stderr}`);
      lastError = err;
      
      if (err.knownError) {
         logger.warn(`Parsed known error: ${err.knownError}`);
      }
      
      if (i === browsers.length - 1) {
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
  const pythonCmd = await systemService.getPythonCommand();
  const processArgs = [ytDlpPath, ...injectGlobalHeaders(args)];
  logger.info(`[spawnYtDlp] COMPLETE COMMAND: ${pythonCmd} ${processArgs.join(' ')}`);
  return spawn(pythonCmd, processArgs);
};

module.exports = {
  executeYtDlp,
  fetchWithRetryAndFallback,
  downloadWithRetryAndFallback,
  spawnYtDlp,
  parseError,
  getBaseYtDlpArgs
};
