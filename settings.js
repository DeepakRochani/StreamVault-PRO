// settings.js
// Centralized Settings Service for StreamVault PRO

window.StreamVaultSettings = {
    defaultFolder: '',
    theme: 'dark', // 'light', 'dark', 'system'
    defaultQuality: 'Best', // '4K', '1080P', '720P', 'Best'
    autoAnalyze: false,
    autoClear: false,
    
    // Load from local storage immediately for fast UI response without waiting for network
    load: function() {
        const localStr = localStorage.getItem('sv_settings');
        if (localStr) {
            try { 
                const parsed = JSON.parse(localStr);
                this.defaultFolder = parsed.defaultFolder !== undefined ? parsed.defaultFolder : this.defaultFolder;
                this.theme = parsed.theme !== undefined ? parsed.theme : this.theme;
                this.defaultQuality = parsed.defaultQuality !== undefined ? parsed.defaultQuality : this.defaultQuality;
                this.autoAnalyze = parsed.autoAnalyze !== undefined ? parsed.autoAnalyze : this.autoAnalyze;
                this.autoClear = parsed.autoClear !== undefined ? parsed.autoClear : this.autoClear;
            } catch(e){}
        }
        this.applyTheme();
    },
    
    // Sync with backend if logged in
    sync: async function() {
        try {
            const res = await fetch((window.API_BASE_URL || '') + '/api/auth/me');
            const data = await res.json();
            if (data.loggedIn && data.user.settings_json) {
                const parsed = JSON.parse(data.user.settings_json);
                this.defaultFolder = parsed.defaultFolder !== undefined ? parsed.defaultFolder : this.defaultFolder;
                this.theme = parsed.theme !== undefined ? parsed.theme : this.theme;
                this.defaultQuality = parsed.defaultQuality !== undefined ? parsed.defaultQuality : this.defaultQuality;
                this.autoAnalyze = parsed.autoAnalyze !== undefined ? parsed.autoAnalyze : this.autoAnalyze;
                this.autoClear = parsed.autoClear !== undefined ? parsed.autoClear : this.autoClear;
                
                // Cache locally for next page load
                localStorage.setItem('sv_settings', JSON.stringify({
                    defaultFolder: this.defaultFolder,
                    theme: this.theme,
                    defaultQuality: this.defaultQuality,
                    autoAnalyze: this.autoAnalyze,
                    autoClear: this.autoClear
                }));
                this.applyTheme();
            }
        } catch(e) {}
    },
    
    save: async function() {
        const payload = {
            defaultFolder: this.defaultFolder,
            theme: this.theme,
            defaultQuality: this.defaultQuality,
            autoAnalyze: this.autoAnalyze,
            autoClear: this.autoClear
        };
        
        localStorage.setItem('sv_settings', JSON.stringify(payload));
        this.applyTheme();
        
        try {
            await fetch((window.API_BASE_URL || '') + '/api/auth/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch(e) {}
    },
    
    applyTheme: function() {
        if (this.theme === 'light') {
            document.documentElement.classList.remove('dark');
        } else if (this.theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            // System fallback
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
                document.documentElement.classList.remove('dark');
            } else {
                document.documentElement.classList.add('dark');
            }
        }
    }
};

// Initialize immediately upon script load
window.StreamVaultSettings.load();
window.StreamVaultSettings.sync();
