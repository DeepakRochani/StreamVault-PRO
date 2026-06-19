window.APP_VERSION = 'v1.0.0';

class AutoUpdater {
    constructor() {
        this.platform = navigator.platform.toLowerCase().includes('mac') ? 'mac' : navigator.platform.toLowerCase().includes('win') ? 'win' : navigator.userAgent.toLowerCase().includes('android') ? 'android' : 'ios';
        this.init();
    }

    async init() {
        // Wait a few seconds after load to not block UI
        setTimeout(() => this.checkForUpdates(), 3000);
        // Check every 24 hours
        setInterval(() => this.checkForUpdates(), 24 * 60 * 60 * 1000);
    }

    async checkForUpdates(manual = false) {
        try {
            const res = await fetch(`/api/system/update/check?currentVersion=${window.APP_VERSION}&platform=${this.platform}`);
            const data = await res.json();
            
            if (data.updateAvailable) {
                this.showUpdateModal(data);
            } else if (manual) {
                alert('You are already on the latest version.');
            }
        } catch(e) {
            console.error('Update check failed', e);
        }
    }

    showUpdateModal(data) {
        if (document.getElementById('updater-modal')) return;

        const isForced = data.forceUpdate || (data.minRequiredVersion && this.compareVersions(window.APP_VERSION, data.minRequiredVersion) < 0);

        const modalHtml = `
        <div id="updater-modal" class="fixed inset-0 z-[1000] flex items-center justify-center">
            <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" ${!isForced ? 'onclick="document.getElementById(\'updater-modal\').remove()"' : ''}></div>
            <div class="bg-surface-container border border-white/10 p-8 rounded-3xl shadow-2xl relative z-10 w-[90%] max-w-md flex flex-col gap-4">
                ${!isForced ? `<button onclick="document.getElementById('updater-modal').remove()" class="absolute top-4 right-4 text-on-surface-variant hover:text-white"><span class="material-symbols-outlined">close</span></button>` : ''}
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                        <span class="material-symbols-outlined text-[28px]">system_update</span>
                    </div>
                    <div>
                        <h2 class="text-2xl font-display font-bold text-on-surface">Update Available</h2>
                        <p class="text-sm font-mono text-primary">Version ${data.version}</p>
                    </div>
                </div>
                
                <div class="bg-black/20 rounded-xl p-4 border border-white/5 text-sm text-on-surface-variant max-h-40 overflow-y-auto">
                    ${data.releaseNotes || 'Bug fixes and performance improvements.'}
                </div>

                <div id="updater-progress-container" class="hidden flex-col gap-2">
                    <div class="flex justify-between text-xs text-on-surface-variant font-mono">
                        <span id="updater-speed">0.00 MB/s</span>
                        <span id="updater-eta">Calculating...</span>
                    </div>
                    <div class="h-2 w-full bg-black/40 rounded-full overflow-hidden relative">
                        <div id="updater-progress-bar" class="absolute top-0 left-0 h-full bg-primary w-0 transition-all duration-300"></div>
                    </div>
                    <div class="text-center text-xs text-on-surface font-bold mt-1" id="updater-status-text">Downloading...</div>
                </div>

                <div id="updater-actions" class="flex flex-col gap-2 mt-2">
                    <button onclick="window.autoUpdater.startDownload('${data.downloadUrl}')" class="w-full py-3 rounded-xl bg-primary text-on-primary font-bold hover:bg-primary-container transition-colors">Update Now</button>
                    ${!isForced ? `
                    <button onclick="document.getElementById('updater-modal').remove()" class="w-full py-3 rounded-xl bg-surface border border-white/10 text-on-surface font-bold hover:bg-white/5 transition-colors">Remind Me Later</button>
                    <button onclick="document.getElementById('updater-modal').remove()" class="w-full text-xs text-on-surface-variant hover:underline pt-2">Skip this version</button>
                    ` : '<p class="text-xs text-error text-center mt-2 font-bold">This is a mandatory update.</p>'}
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async startDownload(url) {
        document.getElementById('updater-actions').classList.add('hidden');
        document.getElementById('updater-progress-container').classList.remove('hidden');
        document.getElementById('updater-progress-container').classList.add('flex');

        try {
            await fetch((window.API_BASE_URL || '') + '/api/system/update/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, platform: this.platform })
            });

            this.pollInterval = setInterval(() => this.pollProgress(), 1000);
        } catch(e) {
            document.getElementById('updater-status-text').innerText = 'Download failed.';
            document.getElementById('updater-status-text').classList.add('text-error');
        }
    }

    async pollProgress() {
        try {
            const res = await fetch((window.API_BASE_URL || '') + '/api/system/update/progress');
            const state = await res.json();

            if (!state.active && state.progress === 100) {
                clearInterval(this.pollInterval);
                this.installUpdate();
                return;
            }

            if (!state.active && state.progress < 100 && state.progress > 0) {
                clearInterval(this.pollInterval);
                document.getElementById('updater-status-text').innerText = 'Download failed.';
                document.getElementById('updater-status-text').classList.add('text-error');
                return;
            }

            document.getElementById('updater-progress-bar').style.width = `${state.progress}%`;
            document.getElementById('updater-speed').innerText = `${state.speedMBps} MB/s`;
            
            const m = Math.floor(state.remainingSeconds / 60);
            const s = state.remainingSeconds % 60;
            document.getElementById('updater-eta').innerText = `${m}m ${s}s remaining`;

        } catch(e) {
            // Ignore temporary network drops
        }
    }

    async installUpdate() {
        document.getElementById('updater-progress-bar').style.width = `100%`;
        document.getElementById('updater-speed').innerText = `Done`;
        document.getElementById('updater-eta').innerText = ``;
        document.getElementById('updater-status-text').innerText = 'Installing and Restarting... Please wait.';
        
        try {
            await fetch((window.API_BASE_URL || '') + '/api/system/update/install', { method: 'POST' });
            
            // Reload page after a delay to attempt reconnection to the new daemon
            setTimeout(() => {
                window.location.reload();
            }, 10000);
        } catch(e) {}
    }

    compareVersions(v1, v2) {
        if (!v1 || !v2) return 0;
        const p1 = v1.replace('v','').split('.').map(Number);
        const p2 = v2.replace('v','').split('.').map(Number);
        for(let i = 0; i < Math.max(p1.length, p2.length); i++) {
            const num1 = p1[i] || 0;
            const num2 = p2[i] || 0;
            if (num1 > num2) return 1;
            if (num1 < num2) return -1;
        }
        return 0;
    }
}

window.autoUpdater = new AutoUpdater();
