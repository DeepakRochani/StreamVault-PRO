const fs = require('fs');
const logger = require('./logger');

/**
 * Validates a Netscape format cookies.txt file.
 * Returns true if the file exists, is valid format, has not entirely expired,
 * and contains SID or LOGIN_INFO cookies for YouTube.
 */
const validateCookiesTxt = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return false;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    
    // Netscape HTTP Cookie File signature is usually present, but we'll focus on parsing lines.
    
    const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
    let hasValidAuthCookie = false;

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments (except HttpOnly prefix which isn't a normal comment but starts with #)
      if (!trimmed || (trimmed.startsWith('#') && !trimmed.startsWith('#HttpOnly_'))) {
        continue;
      }

      // Handle the optional #HttpOnly_ prefix
      const parsedLine = trimmed.startsWith('#HttpOnly_') ? trimmed.substring(10) : trimmed;
      const parts = parsedLine.split('\t');
      
      // Netscape format has exactly 7 tab-separated columns
      if (parts.length < 7) {
        continue;
      }

      const domain = parts[0];
      // const flag = parts[1];
      // const path = parts[2];
      // const secure = parts[3];
      const expiration = parseInt(parts[4], 10);
      const name = parts[5];
      // const value = parts[6];

      // Check for YouTube domain
      if (domain.includes('.youtube.com')) {
        // If expiration is 0, it's a session cookie and doesn't expire until browser closes,
        // otherwise check if it has expired.
        const isExpired = expiration !== 0 && expiration < now;
        
        if (!isExpired) {
          if (name === 'SID' || name === 'LOGIN_INFO') {
            hasValidAuthCookie = true;
            // Stop early once we find a valid auth cookie
            break;
          }
        }
      }
    }

    if (hasValidAuthCookie) {
      logger.info(`[cookieValidator] Found valid YouTube auth cookies in ${filePath}`);
      return true;
    } else {
      logger.warn(`[cookieValidator] No valid/unexpired YouTube auth cookies (SID or LOGIN_INFO) found in ${filePath}`);
      return false;
    }
  } catch (error) {
    logger.error(`[cookieValidator] Error validating cookies file ${filePath}: ${error.message}`);
    return false;
  }
};

module.exports = {
  validateCookiesTxt
};
