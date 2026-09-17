// ============================================================
// StreamVault PRO — Capabilities & Product Entitlement Model
// ============================================================
// Free / Web: 360p, 480p, 720p, 1080p, MP3
// Desktop Pro: 1440p, 4K (2160p), 8K (4320p), DASH & Advanced Muxing
// ============================================================

(function (global) {
    const WEB_MAX_VIDEO_QUALITY = '1080p';

    const WEB_SUPPORTED_QUALITIES = [
        '360p',
        '480p',
        '720p',
        '1080p',
        '360P',
        '480P',
        '720P',
        '1080P',
        'Original',
        'best'
    ];

    const DESKTOP_PRO_VIDEO_QUALITIES = [
        '1440p',
        '2160p',
        '4k',
        '4K',
        '4320p',
        '8k',
        '8K'
    ];

    const WEB_AUDIO_FORMATS = [
        'mp3',
        'MP3',
        'audio',
        '128K',
        '192K',
        '320K',
        '640K'
    ];

    /**
     * Checks if the current environment or user has Desktop Pro capabilities.
     * Running in local Electron/Express desktop mode or having an active Pro/Lifetime plan grants Desktop Pro access.
     */
    function hasDesktopProAccess(user = null) {
        if (typeof window !== 'undefined') {
            // Desktop environment running against localhost Express daemon
            const isDesktopMode = (
                window.location.hostname === 'localhost' || 
                window.location.hostname === '127.0.0.1' || 
                window.location.protocol === 'file:' ||
                (window.API_BASE_URL && (window.API_BASE_URL.includes('127.0.0.1:10000') || window.API_BASE_URL.includes('localhost:10000')))
            );
            if (isDesktopMode) return true;
        }

        // Check user object in window or passed directly
        const activeUser = user || (typeof window !== 'undefined' ? window.currentUser : null);
        if (activeUser) {
            const plan = (activeUser.plan || activeUser.subscription?.plan_id || '').toLowerCase();
            if (plan === 'pro' || plan === 'premium' || plan === 'lifetime' || activeUser.role === 'admin' || activeUser.role === 'super_admin') {
                return true;
            }
        }
        return false;
    }

    /**
     * Evaluates whether a quality / format selection requires Desktop Pro.
     */
    function isDesktopProRequired(qualityId, format, user = null) {
        if (hasDesktopProAccess(user)) return false;
        
        const fmtLower = (format || '').toString().toLowerCase();
        if (fmtLower === 'mp3' || fmtLower === 'audio') {
            return false; // MP3 is web supported
        }

        const qLower = (qualityId || '').toString().toLowerCase();
        
        // Check if it's 1440p, 4K, 8K, 2160p, 4320p
        if (
            qLower.includes('1440') || 
            qLower.includes('2160') || 
            qLower.includes('4k') || 
            qLower.includes('4320') || 
            qLower.includes('8k')
        ) {
            return true;
        }

        return false;
    }

    const Entitlements = {
        WEB_MAX_VIDEO_QUALITY,
        WEB_SUPPORTED_QUALITIES,
        DESKTOP_PRO_VIDEO_QUALITIES,
        WEB_AUDIO_FORMATS,
        hasDesktopProAccess,
        isDesktopProRequired
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Entitlements;
    }
    if (typeof global !== 'undefined') {
        global.StreamVaultEntitlements = Entitlements;
    }
})(typeof window !== 'undefined' ? window : globalThis);
