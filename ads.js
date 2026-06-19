class StreamVaultAd extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.trackedImpression = false;
    }

    async connectedCallback() {
        const type = this.getAttribute('type') || 'banner'; // banner or rectangle
        const location = this.getAttribute('location') || 'unknown';
        
        // Hide instantly by default until confirmed
        this.style.display = 'none';

        try {
            const [pubRes, authRes] = await Promise.all([
                fetch((window.API_BASE_URL || '') + '/api/public-settings'),
                fetch((window.API_BASE_URL || '') + '/api/auth/me')
            ]);
            
            const pubData = await pubRes.json();
            const authData = await authRes.json();
            
            // 1. Check Global Disable
            if (!pubData.success || !pubData.ads_enabled) return;
            
            // 2. Check Specific Placement Disable
            const placement = pubData.ad_placements && pubData.ad_placements[location];
            if (!placement || !placement.enabled) return;
            
            // 3. Check User Plan Limits
            if (authData.loggedIn && authData.user && authData.user.limits) {
                if (!authData.user.limits.ads_enabled) {
                    this.remove();
                    return;
                }
            }
            
            // User is Free or Guest, show ad
            this.style.display = 'flex';
            this.renderAd(type, location, placement.code);
            
            // Track Impression
            if (!this.trackedImpression) {
                this.trackedImpression = true;
                this.trackEvent('impression', location);
            }
            
        } catch(e) {
            return;
        }
    }

    renderAd(type, location, code) {
        if (!code || code.includes('No Code Set')) {
            // Render placeholder if no code is set
            this.shadowRoot.innerHTML = this.getPlaceholderCSS(type) + `<div class="ad-placeholder"></div>`;
            const adEl = this.shadowRoot.querySelector('.ad-placeholder');
            adEl.addEventListener('click', () => {
                this.trackEvent('click', location);
            });
            return;
        }

        // We render actual ad code. To allow scripts to run, we must use the light DOM (or carefully reconstruct scripts).
        // For ad networks, it's safer to mount in light DOM so they can access window objects properly.
        // We will clear the shadow DOM and render into a light DOM wrapper inside ourselves.
        this.shadowRoot.innerHTML = ''; // clear shadow
        
        const wrapper = document.createElement('div');
        wrapper.className = 'w-full flex justify-center';
        wrapper.innerHTML = code;
        
        // Execute any scripts found in the injected HTML
        const scripts = wrapper.querySelectorAll('script');
        scripts.forEach(oldScript => {
            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
            newScript.appendChild(document.createTextNode(oldScript.innerHTML));
            oldScript.parentNode.replaceChild(newScript, oldScript);
        });

        // Append to light DOM so ad networks work normally
        this.appendChild(wrapper);

        // Try to add a click listener to the wrapper for tracking
        wrapper.addEventListener('click', () => {
            this.trackEvent('click', location);
        });
    }

    getPlaceholderCSS(type) {
        const width = type === 'banner' ? '100%' : '300px';
        const height = type === 'banner' ? '90px' : '250px';
        const maxWidth = type === 'banner' ? '728px' : '300px';
        return `
            <style>
                :host { display: flex; justify-content: center; width: 100%; margin: 10px 0; transition: opacity 0.3s ease; }
                .ad-placeholder {
                    width: ${width}; max-width: ${maxWidth}; height: ${height};
                    background: repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.02) 10px, rgba(255, 255, 255, 0.05) 10px, rgba(255, 255, 255, 0.05) 20px);
                    border: 1px dashed rgba(255, 255, 255, 0.1); border-radius: 8px;
                    display: flex; align-items: center; justify-content: center;
                    color: rgba(255, 255, 255, 0.3); font-family: monospace; font-size: 12px; letter-spacing: 2px; text-transform: uppercase;
                    position: relative; overflow: hidden; cursor: pointer;
                }
                .ad-placeholder:hover { border-color: rgba(255,85,64,0.5); color: rgba(255,85,64,0.8); }
                .ad-placeholder::after { content: "ADVERTISEMENT SLOT"; background: rgba(0,0,0,0.5); padding: 4px 10px; border-radius: 4px; }
                @media (max-width: 768px) { .ad-placeholder { height: ${type === 'banner' ? '60px' : '250px'}; } }
            </style>
        `;
    }

    trackEvent(type, location) {
        fetch((window.API_BASE_URL || '') + '/api/ads/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ location, type })
        }).catch(e => {}); 
    }
}

customElements.define('streamvault-ad', StreamVaultAd);

window.toggleAds = function(show) {
    document.querySelectorAll('streamvault-ad').forEach(ad => {
        ad.style.display = show ? 'flex' : 'none';
    });
};
