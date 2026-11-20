// ============================================================
// StreamVault PRO — Dynamic Ad Engine & Admin Management
// Multi-Network Integration: Monetag, Adsterra, Google AdSense, Custom
// Controlled dynamically via StreamVault Admin Panel (/api/admin/ads)
// ============================================================

(function (global) {
    if (typeof window === 'undefined') return;

    // Default Fallback Placements (used if backend is unreachable)
    const DEFAULT_PLACEMENTS = [
        {
            id: "monetag_zone_311191",
            name: "Monetag Auto Tag (Zone 311191)",
            location: "header_global",
            provider: "Monetag",
            code: '<script src="https://quge5.com/88/tag.min.js" data-zone="311191" async data-cfasync="false"></script>',
            is_enabled: 1
        },
        {
            id: "adsterra_popunder",
            name: "Adsterra Popunder Script",
            location: "popunder",
            provider: "Adsterra",
            code: '<script data-cfasync="false" src="https://accountut.com/1/2b933657f8c6419d6092a68ba0a3d43b"></script>',
            is_enabled: 1
        },
        {
            id: "adsterra_socialbar",
            name: "Adsterra Social Bar",
            location: "floating_bar",
            provider: "Adsterra",
            code: '<script data-cfasync="false" src="https://bellnewyork.org/14/36a5484a8ce32d42c19376b0311e706a"></script>',
            is_enabled: 1
        },
        {
            id: "home_header",
            name: "Home Header Banner (728x90 / 320x50)",
            location: "home_header",
            provider: "Adsterra",
            code: `<script type="text/javascript">
atOptions = {
  'key' : '3659b9f3b31b047dfc20ca0f99500e68',
  'format' : 'iframe',
  'height' : 90,
  'width' : 728,
  'params' : {}
};
</script>
<script type="text/javascript" src="https://bellnewyork.org/22/3659b9f3b31b047dfc20ca0f99500e68"></script>`,
            is_enabled: 1
        },
        {
            id: "home_content",
            name: "Home Content Rectangle (300x250)",
            location: "home_content",
            provider: "Adsterra",
            code: `<script type="text/javascript">
atOptions = {
  'key' : '7d264d5af884a6ae24cfced799e093b1',
  'format' : 'iframe',
  'height' : 250,
  'width' : 300,
  'params' : {}
};
</script>
<script type="text/javascript" src="https://bellnewyork.org/22/7d264d5af884a6ae24cfced799e093b1"></script>`,
            is_enabled: 1
        },
        {
            id: "home_download_complete",
            name: "Download Complete Banner (Native)",
            location: "home_download_complete",
            provider: "Adsterra Native",
            code: `<script async="async" data-cfasync="false" src="https://bellnewyork.org/21/234b0bb78fe3652c9b4335cdca5e011e"></script><div id="container-234b0bb78fe3652c9b4335cdca5e011e"></div>`,
            is_enabled: 1
        },
        {
            id: "home_footer",
            name: "Home Footer Banner (728x90)",
            location: "home_footer",
            provider: "Adsterra",
            code: `<script type="text/javascript">
atOptions = {
  'key' : '3659b9f3b31b047dfc20ca0f99500e68',
  'format' : 'iframe',
  'height' : 90,
  'width' : 728,
  'params' : {}
};
</script>
<script type="text/javascript" src="https://bellnewyork.org/22/3659b9f3b31b047dfc20ca0f99500e68"></script>`,
            is_enabled: 1
        },
        {
            id: "google_adsense_global",
            name: "Google AdSense Auto Ads",
            location: "header_global",
            provider: "Google AdSense",
            code: '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7928165411445722" crossorigin="anonymous"></script>',
            is_enabled: 1
        }
    ];

    // Check if user is ad-free
    function isAdFreeUser() {
        try {
            if (window.StreamVaultEntitlements && typeof window.StreamVaultEntitlements.hasDesktopProAccess === 'function') {
                if (window.StreamVaultEntitlements.hasDesktopProAccess()) return true;
            }
            const cachedUser = JSON.parse(localStorage.getItem('streamvault_user') || '{}');
            if (cachedUser && cachedUser.limits && cachedUser.limits.ads_enabled === false) return true;
            const plan = (cachedUser.plan || cachedUser.subscription?.plan_id || '').toLowerCase();
            if (['pro', 'premium', 'lifetime'].includes(plan)) return true;
        } catch (_) {}
        return false;
    }

    // Helper: Safely inject or remove HTML/script snippets
    function injectScriptSnippet(id, code) {
        if (!code || !code.trim()) return;

        // Create temporary container to parse tags
        const temp = document.createElement('div');
        temp.innerHTML = code.trim();

        const scripts = temp.querySelectorAll('script');
        if (scripts.length > 0) {
            scripts.forEach((oldScript, idx) => {
                const uniqueScriptId = `sv-ad-script-${id}-${idx}`;
                if (document.getElementById(uniqueScriptId)) return; // already active

                const newScript = document.createElement('script');
                newScript.id = uniqueScriptId;
                newScript.setAttribute('data-streamvault-ad-id', id);

                Array.from(oldScript.attributes).forEach(attr => {
                    newScript.setAttribute(attr.name, attr.value);
                });

                if (oldScript.src) {
                    newScript.src = oldScript.src;
                } else {
                    newScript.textContent = oldScript.textContent;
                }

                (document.head || document.documentElement).appendChild(newScript);
            });
        }
    }

    function removeScriptSnippet(id) {
        const injected = document.querySelectorAll(`[data-streamvault-ad-id="${id}"]`);
        injected.forEach(el => el.remove());

        // Also clean up by known patterns if applicable
        if (id === 'monetag_zone_311191') {
            document.querySelectorAll('script[data-zone="311191"], script[src*="quge5.com"]').forEach(el => el.remove());
        } else if (id === 'adsterra_popunder') {
            document.querySelectorAll('script[src*="accountut.com"]').forEach(el => el.remove());
        } else if (id === 'adsterra_socialbar') {
            document.querySelectorAll('script[src*="bellnewyork.org/14"]').forEach(el => el.remove());
        } else if (id === 'google_adsense_global') {
            document.querySelectorAll('script[src*="pagead2.googlesyndication.com"]').forEach(el => el.remove());
        }
    }

    // Apply active global ad tags (Popunders, Social Bars, Monetag, AdSense)
    function applyGlobalAdScripts(placements, adsEnabled) {
        if (!adsEnabled || isAdFreeUser()) {
            // Remove all global ad scripts
            placements.forEach(p => removeScriptSnippet(p.id));
            return;
        }

        placements.forEach(p => {
            const isEnabled = p.is_enabled === 1 || p.is_enabled === true || p.is_enabled === '1' || p.is_enabled === 'true';
            const isGlobalType = ['header_global', 'popunder', 'floating_bar'].includes(p.location);

            if (isGlobalType) {
                if (isEnabled) {
                    injectScriptSnippet(p.id, p.code);
                } else {
                    removeScriptSnippet(p.id);
                }
            }
        });
    }

    // Load active placements from Admin API / Supabase
    async function fetchAdPlacements() {
        if (isAdFreeUser()) {
            window.__STREAMVAULT_ADS_ENABLED = false;
            window.__STREAMVAULT_AD_PLACEMENTS = [];
            return;
        }

        let placements = null;
        let adsEnabled = true;

        try {
            // 1. Try local cache first for instant rendering
            const cached = localStorage.getItem('streamvault_cached_ad_placements');
            const cachedEnabled = localStorage.getItem('streamvault_ads_enabled');
            if (cached) {
                placements = JSON.parse(cached);
                adsEnabled = cachedEnabled !== 'false';
                window.__STREAMVAULT_AD_PLACEMENTS = placements;
                window.__STREAMVAULT_ADS_ENABLED = adsEnabled;
                applyGlobalAdScripts(placements, adsEnabled);
            }
        } catch (_) {}

        // 2. Fetch fresh config from backend
        try {
            const apiBase = window.API_BASE_URL || '';
            let res = await fetch(`${apiBase}/api/admin/ads`, {
                signal: AbortSignal.timeout ? AbortSignal.timeout(2000) : undefined
            }).catch(() => null);

            if (!res || !res.ok) {
                const fallbackUrl = (window.SUPABASE_FUNCTIONS_URL || 'https://sjnamkshicpxtyikzsnp.supabase.co/functions/v1') + '/admin/ads';
                const headers = {};
                if (window.SUPABASE_ANON_KEY) {
                    headers['apikey'] = window.SUPABASE_ANON_KEY;
                    headers['Authorization'] = 'Bearer ' + window.SUPABASE_ANON_KEY;
                }
                res = await fetch(fallbackUrl, {
                    headers,
                    signal: AbortSignal.timeout ? AbortSignal.timeout(2000) : undefined
                }).catch(() => null);
            }

            if (res && res.ok) {
                const data = await res.json();
                if (data && data.success && Array.isArray(data.placements)) {
                    placements = data.placements;
                    adsEnabled = data.ads_enabled !== false;

                    window.__STREAMVAULT_AD_PLACEMENTS = placements;
                    window.__STREAMVAULT_ADS_ENABLED = adsEnabled;

                    try {
                        localStorage.setItem('streamvault_cached_ad_placements', JSON.stringify(placements));
                        localStorage.setItem('streamvault_ads_enabled', String(adsEnabled));
                    } catch (_) {}

                    applyGlobalAdScripts(placements, adsEnabled);
                    refreshCustomAdElements();
                    return;
                }
            }
        } catch (err) {
            console.warn('[StreamVault Ads] Remote fetch failed, using fallback:', err);
        }

        // 3. If no cache or network failed, apply default fallback placements
        if (!placements) {
            placements = DEFAULT_PLACEMENTS;
            adsEnabled = true;
            window.__STREAMVAULT_AD_PLACEMENTS = placements;
            window.__STREAMVAULT_ADS_ENABLED = adsEnabled;
            applyGlobalAdScripts(placements, adsEnabled);
        }
    }

    function refreshCustomAdElements() {
        document.querySelectorAll('streamvault-ad').forEach(el => {
            if (typeof el.renderPlacement === 'function') {
                el.renderPlacement();
            }
        });
    }

    // Custom Element: <streamvault-ad location="..." type="...">
    class StreamVaultAd extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this.trackedImpression = false;
        }

        connectedCallback() {
            this.renderPlacement();
        }

        renderPlacement() {
            const location = this.getAttribute('location') || 'unknown';
            const type = this.getAttribute('type') || 'banner';

            // Check if ads are disabled globally or for pro user
            if (window.__STREAMVAULT_ADS_ENABLED === false || isAdFreeUser()) {
                this.style.display = 'none';
                this.shadowRoot.innerHTML = '';
                return;
            }

            // Find placement in loaded list
            const placements = window.__STREAMVAULT_AD_PLACEMENTS || DEFAULT_PLACEMENTS;
            const placement = placements.find(p => p.location === location || p.id === location);

            if (placement) {
                const isEnabled = placement.is_enabled === 1 || placement.is_enabled === true || placement.is_enabled === '1' || placement.is_enabled === 'true';
                if (!isEnabled) {
                    this.style.display = 'none';
                    this.shadowRoot.innerHTML = '';
                    return;
                }

                if (placement.code && !placement.code.includes('No Code Set') && !placement.code.startsWith('<!--')) {
                    this.style.display = 'flex';
                    this.renderAdCode(placement.code, location);
                    return;
                }
            }

            // Default fallback banner
            const fallbackCode = this.getDefaultAdsterraCode(location, type);
            if (fallbackCode) {
                this.style.display = 'flex';
                this.renderAd(type, location, fallbackCode);
            } else {
                this.style.display = 'none';
            }
        }

        renderAdCode(code, location) {
            this.shadowRoot.innerHTML = '';
            const wrapper = document.createElement('div');
            wrapper.className = 'w-full flex justify-center items-center my-2 overflow-hidden';
            wrapper.innerHTML = code;

            const scripts = wrapper.querySelectorAll('script');
            scripts.forEach(oldScript => {
                const newScript = document.createElement('script');
                Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                newScript.appendChild(document.createTextNode(oldScript.innerHTML));
                oldScript.parentNode.replaceChild(newScript, oldScript);
            });

            this.shadowRoot.appendChild(wrapper);
            if (!this.trackedImpression) {
                this.trackedImpression = true;
                this.trackEvent('impression', location);
            }
        }

        getDefaultAdsterraCode(location, type) {
            const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
            switch (location) {
                case 'home_header':
                case 'home_footer':
                case 'converter_footer':
                    return isMobile ? {
                        width: 320, height: 50,
                        html: `<script type="text/javascript">atOptions={'key':'8dd367f475052cece124fa67c7470fbc','format':'iframe','height':50,'width':320,'params':{}};</script><script type="text/javascript" src="https://bellnewyork.org/22/8dd367f475052cece124fa67c7470fbc"></script>`
                    } : {
                        width: 728, height: 90,
                        html: `<script type="text/javascript">atOptions={'key':'3659b9f3b31b047dfc20ca0f99500e68','format':'iframe','height':90,'width':728,'params':{}};</script><script type="text/javascript" src="https://bellnewyork.org/22/3659b9f3b31b047dfc20ca0f99500e68"></script>`
                    };
                case 'home_content':
                case 'converter_content':
                case 'rewarded_video':
                    return {
                        width: 300, height: 250,
                        html: `<script type="text/javascript">atOptions={'key':'7d264d5af884a6ae24cfced799e093b1','format':'iframe','height':250,'width':300,'params':{}};</script><script type="text/javascript" src="https://bellnewyork.org/22/7d264d5af884a6ae24cfced799e093b1"></script>`
                    };
                case 'home_download_complete':
                    return {
                        width: '100%', height: 'auto', isNative: true,
                        html: `<script async="async" data-cfasync="false" src="https://bellnewyork.org/21/234b0bb78fe3652c9b4335cdca5e011e"></script><div id="container-234b0bb78fe3652c9b4335cdca5e011e"></div>`
                    };
                default:
                    return {
                        width: 300, height: 250,
                        html: `<script type="text/javascript">atOptions={'key':'7d264d5af884a6ae24cfced799e093b1','format':'iframe','height':250,'width':300,'params':{}};</script><script type="text/javascript" src="https://bellnewyork.org/22/7d264d5af884a6ae24cfced799e093b1"></script>`
                    };
            }
        }

        renderAd(type, location, adConfig) {
            this.shadowRoot.innerHTML = '';
            const wrapper = document.createElement('div');
            wrapper.className = 'w-full flex justify-center items-center my-2 overflow-hidden';

            if (typeof adConfig === 'object' && adConfig.html) {
                if (adConfig.isNative) {
                    wrapper.innerHTML = adConfig.html;
                    const scripts = wrapper.querySelectorAll('script');
                    scripts.forEach(oldScript => {
                        const newScript = document.createElement('script');
                        Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                        newScript.appendChild(document.createTextNode(oldScript.innerHTML));
                        oldScript.parentNode.replaceChild(newScript, oldScript);
                    });
                } else {
                    const iframe = document.createElement('iframe');
                    iframe.style.border = 'none';
                    iframe.style.width = typeof adConfig.width === 'number' ? `${adConfig.width}px` : adConfig.width;
                    iframe.style.height = typeof adConfig.height === 'number' ? `${adConfig.height}px` : adConfig.height;
                    iframe.style.maxWidth = '100%';
                    iframe.style.overflow = 'hidden';
                    iframe.scrolling = 'no';
                    iframe.setAttribute('loading', 'lazy');
                    iframe.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;display:flex;justify-content:center;align-items:center;background:transparent;overflow:hidden;}</style></head><body>${adConfig.html}</body></html>`;
                    wrapper.appendChild(iframe);
                }
            }

            this.shadowRoot.appendChild(wrapper);
            if (!this.trackedImpression) {
                this.trackedImpression = true;
                this.trackEvent('impression', location);
            }
        }

        trackEvent(type, location) {
            fetch((window.API_BASE_URL || '') + '/api/ads/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ location, type })
            }).catch(() => {});
        }
    }

    if (!customElements.get('streamvault-ad')) {
        customElements.define('streamvault-ad', StreamVaultAd);
    }

    window.toggleAds = function(show) {
        window.__STREAMVAULT_ADS_ENABLED = show;
        document.querySelectorAll('streamvault-ad').forEach(ad => {
            ad.style.display = show ? 'flex' : 'none';
        });
    };

    window.StreamVaultAds = {
        refreshAds: fetchAdPlacements,
        getPlacements: () => window.__STREAMVAULT_AD_PLACEMENTS || DEFAULT_PLACEMENTS,
        toggleAds: window.toggleAds,
        isAdFreeUser: isAdFreeUser
    };

    // Initialize ads engine
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fetchAdPlacements);
    } else {
        fetchAdPlacements();
    }

})(typeof window !== 'undefined' ? window : globalThis);
