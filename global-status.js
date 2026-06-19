document.addEventListener('DOMContentLoaded', async () => {
    // Inject Overlay HTML if not present
    if (!document.getElementById('sv-global-overlays')) {
        const overlayHtml = `
            <div id="sv-global-overlays" class="fixed inset-0 z-[9999] pointer-events-none">
                <!-- Maintenance Mode Overlay -->
                <div id="overlay-maintenance" class="hidden absolute inset-0 pointer-events-auto bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center">
                    <span class="material-symbols-outlined text-[64px] text-orange-400 mb-6">engineering</span>
                    <h1 class="text-4xl font-display font-bold text-on-surface mb-4">Under Maintenance</h1>
                    <p class="text-on-surface-variant max-w-md text-lg">StreamVault is currently undergoing scheduled maintenance to improve our services. Please check back later.</p>
                </div>
                
                <!-- Force Update Overlay -->
                <div id="overlay-force-update" class="hidden absolute inset-0 pointer-events-auto bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center">
                    <span class="material-symbols-outlined text-[64px] text-primary mb-6">system_update</span>
                    <h1 class="text-4xl font-display font-bold text-on-surface mb-4">Update Required</h1>
                    <p class="text-on-surface-variant max-w-md text-lg mb-8">A mandatory update is required to continue using StreamVault securely. Please download the latest version.</p>
                    <a href="#" class="bg-primary text-on-primary font-bold px-8 py-4 rounded-xl hover:bg-primary-container transition-colors shadow-[0_0_20px_rgba(255,85,64,0.4)]">Download Update</a>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', overlayHtml);
    }

    // Check Status
    try {
        const res = await fetch((window.API_BASE_URL || '') + '/api/app/status');
        const data = await res.json();
        
        const settingsRes = await fetch((window.API_BASE_URL || '') + '/api/public-settings');
        const settingsData = await settingsRes.json();
        window.loginEnabled = settingsData.settings.login_enabled === 'true';
        window.subscriptionEnabled = settingsData.settings.subscription_enabled;
        window.planPremiumEnabled = settingsData.settings.plan_premium_enabled;
        window.planProEnabled = settingsData.settings.plan_pro_enabled;
        window.planLifetimeEnabled = settingsData.settings.plan_lifetime_enabled;
        window.rewardedAdsEnabled = settingsData.settings.rewarded_ads_enabled;
        window.rewardedAdCooldown = settingsData.settings.rewarded_ad_cooldown_mins;
        window.rewardedAdFrequency = settingsData.settings.rewarded_ad_frequency_downloads;
        
        if (typeof window.onSettingsLoaded === 'function') {
            window.onSettingsLoaded();
        }
        
        if (data.maintenance_mode) {
            document.getElementById('overlay-maintenance').classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        } else if (data.force_update) {
            document.getElementById('overlay-force-update').classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
    } catch(e) {
        console.error("Failed to check app status", e);
    }
});
