// StreamVault PRO Ad Engine - Adsterra & Multi-Network Integration
// Publisher ID: 6205348

(function initAdsterraGlobalTags() {
    if (typeof window === 'undefined') return;

    // Check if user is already known to be premium/ad-free in localStorage
    try {
        const cachedUser = JSON.parse(localStorage.getItem('streamvault_user') || '{}');
        if (cachedUser && cachedUser.limits && cachedUser.limits.ads_enabled === false) {
            return; // Ad-free user, do not inject global scripts
        }
    } catch (_) {}

    // 1. Adsterra Popunder Script
    if (!document.querySelector('script[src*="accountut.com/1/2b933657f8c6419d6092a68ba0a3d43b"]')) {
        const popScript = document.createElement('script');
        popScript.setAttribute('data-cfasync', 'false');
        popScript.src = 'https://accountut.com/1/2b933657f8c6419d6092a68ba0a3d43b';
        document.head.appendChild(popScript);
    }

    // 2. Adsterra Social Bar Script
    if (!document.querySelector('script[src*="bellnewyork.org/14/36a5484a8ce32d42c19376b0311e706a"]')) {
        const socScript = document.createElement('script');
        socScript.setAttribute('data-cfasync', 'false');
        socScript.src = 'https://bellnewyork.org/14/36a5484a8ce32d42c19376b0311e706a';
        document.head.appendChild(socScript);
    }
})();

class StreamVaultAd extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.trackedImpression = false;
    }

    async connectedCallback() {
        const type = this.getAttribute('type') || 'banner';
        const location = this.getAttribute('location') || 'unknown';

        this.style.display = 'none';

        // Check if user is Ad-Free (Pro or Lifetime member)
        let isAdFree = false;
        try {
            const authRes = await fetch((window.API_BASE_URL || '') + '/api/auth/me', {
                signal: AbortSignal.timeout ? AbortSignal.timeout(1200) : undefined
            }).catch(() => null);

            if (authRes && authRes.ok) {
                const authData = await authRes.json();
                if (authData.loggedIn && authData.user && authData.user.limits) {
                    if (authData.user.limits.ads_enabled === false) {
                        isAdFree = true;
                    }
                }
            } else {
                const cachedUser = JSON.parse(localStorage.getItem('streamvault_user') || '{}');
                if (cachedUser && cachedUser.limits && cachedUser.limits.ads_enabled === false) {
                    isAdFree = true;
                }
            }
        } catch (_) {}

        if (isAdFree) {
            this.remove();
            return;
        }

        // Check remote custom placement from admin / public-settings
        let customCode = null;
        try {
            const pubRes = await fetch((window.API_BASE_URL || '') + '/api/public-settings', {
                signal: AbortSignal.timeout ? AbortSignal.timeout(1200) : undefined
            }).catch(() => null);

            if (pubRes && pubRes.ok) {
                const pubData = await pubRes.json();
                if (pubData && pubData.success) {
                    if (pubData.ads_enabled === false) {
                        this.remove();
                        return;
                    }
                    const placement = pubData.ad_placements && pubData.ad_placements[location];
                    if (placement) {
                        if (!placement.enabled) {
                            this.remove();
                            return;
                        }
                        if (placement.code && !placement.code.includes('No Code Set')) {
                            customCode = placement.code;
                        }
                    }
                }
            }
        } catch (_) {}

        const adConfig = customCode || this.getDefaultAdsterraCode(location, type);
        if (!adConfig) {
            this.remove();
            return;
        }

        this.style.display = 'flex';
        this.renderAd(type, location, adConfig);

        if (!this.trackedImpression) {
            this.trackedImpression = true;
            this.trackEvent('impression', location);
        }
    }

    getDefaultAdsterraCode(location, type) {
        const isMobile = window.innerWidth < 768;

        switch (location) {
            case 'home_header':
            case 'home_footer':
            case 'converter_footer':
                if (isMobile) {
                    return {
                        width: 320,
                        height: 50,
                        html: `
                            <script type="text/javascript">
                                atOptions = {
                                    'key' : '8dd367f475052cece124fa67c7470fbc',
                                    'format' : 'iframe',
                                    'height' : 50,
                                    'width' : 320,
                                    'params' : {}
                                };
                            </script>
                            <script type="text/javascript" src="https://bellnewyork.org/22/8dd367f475052cece124fa67c7470fbc"></script>
                        `
                    };
                } else {
                    return {
                        width: 728,
                        height: 90,
                        html: `
                            <script type="text/javascript">
                                atOptions = {
                                    'key' : '3659b9f3b31b047dfc20ca0f99500e68',
                                    'format' : 'iframe',
                                    'height' : 90,
                                    'width' : 728,
                                    'params' : {}
                                };
                            </script>
                            <script type="text/javascript" src="https://bellnewyork.org/22/3659b9f3b31b047dfc20ca0f99500e68"></script>
                        `
                    };
                }

            case 'home_content':
            case 'converter_content':
            case 'rewarded_video':
                return {
                    width: 300,
                    height: 250,
                    html: `
                        <script type="text/javascript">
                            atOptions = {
                                'key' : '7d264d5af884a6ae24cfced799e093b1',
                                'format' : 'iframe',
                                'height' : 250,
                                'width' : 300,
                                'params' : {}
                            };
                        </script>
                        <script type="text/javascript" src="https://bellnewyork.org/22/7d264d5af884a6ae24cfced799e093b1"></script>
                    `
                };

            case 'home_download_complete':
                return {
                    width: '100%',
                    height: 'auto',
                    isNative: true,
                    html: `
                        <script async="async" data-cfasync="false" src="https://bellnewyork.org/21/234b0bb78fe3652c9b4335cdca5e011e"></script>
                        <div id="container-234b0bb78fe3652c9b4335cdca5e011e"></div>
                    `
                };

            case 'profile_settings_footer':
                return {
                    width: isMobile ? 320 : 468,
                    height: isMobile ? 50 : 60,
                    html: isMobile ? `
                        <script type="text/javascript">
                            atOptions = {
                                'key' : '8dd367f475052cece124fa67c7470fbc',
                                'format' : 'iframe',
                                'height' : 50,
                                'width' : 320,
                                'params' : {}
                            };
                        </script>
                        <script type="text/javascript" src="https://bellnewyork.org/22/8dd367f475052cece124fa67c7470fbc"></script>
                    ` : `
                        <script type="text/javascript">
                            atOptions = {
                                'key' : '187d356973a5615573097567743c4165',
                                'format' : 'iframe',
                                'height' : 60,
                                'width' : 468,
                                'params' : {}
                            };
                        </script>
                        <script type="text/javascript" src="https://bellnewyork.org/22/187d356973a5615573097567743c4165"></script>
                    `
                };

            default:
                return {
                    width: 300,
                    height: 250,
                    html: `
                        <script type="text/javascript">
                            atOptions = {
                                'key' : '7d264d5af884a6ae24cfced799e093b1',
                                'format' : 'iframe',
                                'height' : 250,
                                'width' : 300,
                                'params' : {}
                            };
                        </script>
                        <script type="text/javascript" src="https://bellnewyork.org/22/7d264d5af884a6ae24cfced799e093b1"></script>
                    `
                };
        }
    }

    renderAd(type, location, adConfig) {
        this.shadowRoot.innerHTML = '';

        const wrapper = document.createElement('div');
        wrapper.className = 'w-full flex justify-center items-center my-2 overflow-hidden';

        if (typeof adConfig === 'object' && adConfig.html) {
            if (adConfig.isNative) {
                // Native Banner insertion
                wrapper.innerHTML = adConfig.html;
                const scripts = wrapper.querySelectorAll('script');
                scripts.forEach(oldScript => {
                    const newScript = document.createElement('script');
                    Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                    newScript.appendChild(document.createTextNode(oldScript.innerHTML));
                    oldScript.parentNode.replaceChild(newScript, oldScript);
                });
            } else {
                // Isolated Iframe ensures atOptions never collide across multiple banners
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
        } else if (typeof adConfig === 'string') {
            wrapper.innerHTML = adConfig;
            const scripts = wrapper.querySelectorAll('script');
            scripts.forEach(oldScript => {
                const newScript = document.createElement('script');
                Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                newScript.appendChild(document.createTextNode(oldScript.innerHTML));
                oldScript.parentNode.replaceChild(newScript, oldScript);
            });
        }

        this.appendChild(wrapper);

        wrapper.addEventListener('click', () => {
            this.trackEvent('click', location);
        });
    }

    trackEvent(type, location) {
        fetch((window.API_BASE_URL || '') + '/api/ads/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ location, type })
        }).catch(() => {});
    }
}

customElements.define('streamvault-ad', StreamVaultAd);

window.toggleAds = function(show) {
    document.querySelectorAll('streamvault-ad').forEach(ad => {
        ad.style.display = show ? 'flex' : 'none';
    });
};
