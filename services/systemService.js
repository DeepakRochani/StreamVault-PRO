const { spawn, exec, execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const logger = require('./logger');

const getPythonCommand = () => {
  return new Promise((resolve) => {
    if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
      return resolve(process.env.PYTHON_PATH);
    }
    const candidates = process.platform === 'win32' 
      ? ['python', 'py', 'python3'] 
      : ['python3', 'python'];

    const tryNext = (index) => {
      if (index >= candidates.length) {
        return resolve(process.platform === 'win32' ? 'python' : 'python3');
      }
      const candidate = candidates[index];
      const proc = spawn(candidate, ['--version']);
      proc.on('close', (code) => {
        if (code === 0) resolve(candidate);
        else tryNext(index + 1);
      });
      proc.on('error', () => {
        tryNext(index + 1);
      });
    };

    tryNext(0);
  });
};

const checkPythonVersion = async () => {
  const pythonCmd = await getPythonCommand();
  return new Promise((resolve) => {
    const py = spawn(pythonCmd, ['-c', 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")']);
    let version = '';
    py.stdout.on('data', (data) => version += data.toString());
    py.on('close', (code) => {
      if (code === 0) {
        version = version.trim();
        const [major, minor] = version.split('.').map(Number);
        if (major < 3 || (major === 3 && minor < 10)) {
          logger.warn(`Python version ${version} detected. yt-dlp recommends Python 3.10+`);
          resolve({ valid: false, version, message: `Python version ${version} detected. Recommended is 3.10+` });
        } else {
          logger.info(`Python version ${version} detected. (Good)`);
          resolve({ valid: true, version });
        }
      } else {
        logger.error('Failed to get Python version');
        resolve({ valid: false, version: 'Unknown', message: 'Failed to detect Python' });
      }
    });
    py.on('error', (err) => {
       logger.error(`Error checking python version: ${err.message}`);
       resolve({ valid: false, version: 'Error', message: 'Error detecting Python' });
    });
  });
};

const updateYtDlp = async (ytDlpPath) => {
  return new Promise(async (resolve) => {
    logger.info('Checking for yt-dlp updates...');
    let proc;
    const isBinary = !ytDlpPath.endsWith('.py');

    if (isBinary) {
      proc = spawn(ytDlpPath, ['-U']);
    } else {
      const pythonCmd = await getPythonCommand();
      proc = spawn(pythonCmd, [ytDlpPath, '-U']);
    }
    
    let output = '';
    proc.stdout.on('data', (data) => output += data.toString());
    proc.stderr.on('data', (data) => output += data.toString());
    
    proc.on('close', (code) => {
      if (code === 0) {
        logger.info('yt-dlp update check completed.', { output });
        resolve({ success: true, output });
      } else {
        logger.warn(`yt-dlp update exited with code ${code}`, { output });
        resolve({ success: false, output });
      }
    });
    proc.on('error', (err) => {
      logger.warn(`Error updating yt-dlp: ${err.message}`);
      resolve({ success: false, error: err.message });
    });
  });
};

const getFreeDiskSpace = (driveLetter, isWindows, downloadsDir) => {
  try {
    if (isWindows) {
      const stdout = execSync(`powershell -Command "(Get-Volume -DriveLetter ${driveLetter}).SizeRemaining"`, { encoding: 'utf8' });
      const bytes = parseInt(stdout.trim(), 10);
      if (!isNaN(bytes)) return bytes;
    } else {
      const stdout = execSync(`df -k "${downloadsDir}" | tail -1 | awk '{print $4}'`, { encoding: 'utf8' });
      const kb = parseInt(stdout.trim(), 10);
      if (!isNaN(kb)) return kb * 1024;
    }
  } catch (e) {
    logger.error("Failed to fetch disk space, falling back:", e.message);
  }
  return 999999999999;
};

const getMediaMetadata = (resolvedPath) => {
  return new Promise((resolve, reject) => {
    exec(`ffprobe -v quiet -print_format json -show_streams -show_format "${resolvedPath}" 2>&1`, { timeout: 10000 }, (err, stdout) => {
      if (err) {
        reject(err);
      } else {
        resolve(stdout);
      }
    });
  });
};

const openFileInExplorer = (resolvedPath, isWindows) => {
  return new Promise((resolve) => {
    try {
      if (isWindows) {
        exec(`explorer.exe /select,"${resolvedPath}"`, (err) => resolve(!err));
      } else {
        exec(`open -R "${resolvedPath}"`, (err) => resolve(!err));
      }
    } catch(e) { resolve(false); }
  });
};

const openDirectoryInExplorer = (downloadsDir, isWindows) => {
  return new Promise((resolve) => {
    try {
      if (isWindows) {
        exec(`explorer.exe "${downloadsDir}"`, (err) => resolve(!err));
      } else {
        exec(`open "${downloadsDir}"`, (err) => resolve(!err));
      }
    } catch(e) { resolve(false); }
  });
};

const playMedia = (resolvedPath, isWindows) => {
  return new Promise((resolve) => {
    try {
      if (isWindows) {
        exec(`start "" "${resolvedPath}"`, (err) => resolve(!err));
      } else {
        exec(`open "${resolvedPath}"`, (err) => resolve(!err));
      }
    } catch(e) { resolve(false); }
  });
};

const getVersionInfo = (ytDlpPath, ffmpegPath) => {
  let pyVersion = 'Not installed', ytdlpVersion = 'Not installed', ffmpegVersion = 'Not installed';
  try { pyVersion = execSync('python3 --version', {stdio: 'pipe'}).toString().trim(); } catch(e){}
  try { ytdlpVersion = execSync(`"${ytDlpPath}" --version`, {stdio: 'pipe'}).toString().trim(); } catch(e){}
  try { ffmpegVersion = execSync('"' + ffmpegPath + '" -version', {stdio: 'pipe'}).toString().split('\n')[0].trim(); } catch(e){}
  return { pyVersion, ytdlpVersion, ffmpegVersion };
};

const verifyPythonEnvironmentSync = () => {
  try {
      execSync('python3 --version', {stdio: 'pipe'});
      return true;
  } catch (e) {
      return false;
  }
};

const verifyYtDlpSync = (ytDlpPath) => {
  try {
      execSync(`"${ytDlpPath}" --version`, {stdio: 'pipe'});
      return true;
  } catch (e) {
      return false;
  }
};

const verifyFfmpegSync = (ffmpegPath) => {
  try {
      execSync('"' + ffmpegPath + '" -version', {stdio: 'pipe'});
      return true;
  } catch (e) {
      return false;
  }
};

const getInstalledBrowsers = () => {
  const isWindows = os.platform() === 'win32';
  const isMac = os.platform() === 'darwin';
  const installed = [];

  const browsers = [
    { name: 'chrome', winPath: process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data') : '', macPath: path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome') },
    { name: 'brave', winPath: process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'User Data') : '', macPath: path.join(os.homedir(), 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser') },
    { name: 'edge', winPath: process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data') : '', macPath: path.join(os.homedir(), 'Library', 'Application Support', 'Microsoft Edge') },
    { name: 'firefox', winPath: process.env.APPDATA ? path.join(process.env.APPDATA, 'Mozilla', 'Firefox', 'Profiles') : '', macPath: path.join(os.homedir(), 'Library', 'Application Support', 'Firefox', 'Profiles') }
  ];

  for (const b of browsers) {
    const p = isWindows ? b.winPath : (isMac ? b.macPath : null);
    if (p && fs.existsSync(p)) {
      try {
        // Use fs.openSync to actually test read access, which triggers TCC checks on macOS.
        // fs.accessSync often returns true even if macOS blocks access with 'Operation not permitted'.
        const fd = fs.openSync(p, 'r');
        fs.closeSync(fd);
        installed.push(b.name);
      } catch (e) {
        logger.warn(`Browser ${b.name} cookie database is not readable: ${e.message}`);
      }
    }
  }

  return installed;
};

module.exports = {
  getPythonCommand,
  checkPythonVersion,
  updateYtDlp,
  getFreeDiskSpace,
  getMediaMetadata,
  openFileInExplorer,
  openDirectoryInExplorer,
  playMedia,
  getVersionInfo,
  verifyPythonEnvironmentSync,
  verifyYtDlpSync,
  verifyFfmpegSync,
  getInstalledBrowsers
};
