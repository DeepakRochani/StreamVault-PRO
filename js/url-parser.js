class URLParser {
    static normalize(inputUrl) {
        let urlStr = inputUrl.trim();
        
        // Fix missing protocol
        if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
            urlStr = 'https://' + urlStr;
        }

        try {
            const parsed = new URL(urlStr);
            
            // Strip common tracking parameters that mess up yt-dlp
            const trackers = ['igsh', 'fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 'si'];
            trackers.forEach(param => parsed.searchParams.delete(param));
            
            // Handle shortened YouTube URLs if necessary, but yt-dlp handles youtu.be fine
            return parsed.toString();
        } catch (e) {
            return null; // Malformed URL
        }
    }

    static detectPlatform(urlStr) {
        const normalized = this.normalize(urlStr);
        if (!normalized) {
            return { valid: false, type: 'invalid', reason: "Malformed URL format. Please check the spelling." };
        }

        try {
            const parsed = new URL(normalized);
            const host = parsed.hostname.toLowerCase();
            const path = parsed.pathname.toLowerCase();

            // Direct Media Extensions
            const directExtensions = ['.mp4', '.webm', '.mp3', '.mov', '.ogg', '.m4a'];
            if (directExtensions.some(ext => path.endsWith(ext) || parsed.search.includes(ext))) {
                return { valid: true, type: 'direct', normalizedUrl: normalized };
            }

            // YouTube
            if (host.includes('youtube.com') || host.includes('youtu.be')) {
                return { valid: true, type: 'youtube', normalizedUrl: normalized };
            }

            // Instagram
            if (host.includes('instagram.com')) {
                // Allow any path except the bare homepage
                if (path.length > 1 && path !== '/') {
                    return { valid: true, type: 'instagram', normalizedUrl: normalized };
                }
                return { valid: false, type: 'instagram', reason: "Invalid Instagram link. Please paste a link to a specific Video, Reel, Post, or Story." };
            }

            // Facebook (Support watch, reel, share, fb.watch)
            if (host.includes('facebook.com') || host.includes('fb.watch')) {
                if (path.length > 1 && path !== '/') {
                    return { valid: true, type: 'facebook', normalizedUrl: normalized };
                }
                return { valid: false, type: 'facebook', reason: "Invalid Facebook link. Please paste a link to a specific Video or Reel." };
            }

            // Unsupported platforms
            if (host.includes('vimeo.com') || host.includes('tiktok.com') || host.includes('twitter.com') || host.includes('x.com')) {
                return { valid: false, type: 'unsupported_platform', reason: "This platform enforces strict CORS/signature security. Direct browser-only downloads are restricted. Please configure a StreamVault local backend daemon to capture this stream." };
            }

            // Generic web stream fallback
            return { valid: true, type: 'generic', normalizedUrl: normalized };

        } catch (e) {
            return { valid: false, type: 'invalid', reason: "Malformed URL format." };
        }
    }
}

// Export for module usage, or attach to window for script tag inclusion
if (typeof module !== 'undefined' && module.exports) {
    module.exports = URLParser;
} else {
    window.URLParser = URLParser;
}
