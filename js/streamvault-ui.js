// ============================================================
// StreamVault PRO - 2026 NextLevel UI/UX Engine
// Glassmorphism 2.0, Cosmic Atmospheric Depth & Tactile Micro-Interactions
// ============================================================

(function() {
    'use strict';

    // ── 1. Toast Notification System ──────────────────────────────
    function getOrCreateToastContainer() {
        let container = document.getElementById('sv-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'sv-toast-container';
            container.className = 'fixed top-20 right-4 sm:right-6 z-[99999] flex flex-col gap-2.5 pointer-events-none max-w-sm w-[calc(100%-2rem)]';
            document.body.appendChild(container);
        }
        return container;
    }

    window.showToast = function(message, type = 'info', duration = 3500) {
        const container = getOrCreateToastContainer();
        const toast = document.createElement('div');
        
        const typeConfigs = {
            success: {
                icon: 'check_circle',
                border: 'border-emerald-500/30',
                bg: 'bg-[#061e18]/90 text-emerald-200',
                glow: 'shadow-[0_8px_30px_rgba(16,185,129,0.25)]',
                iconColor: 'text-emerald-400'
            },
            error: {
                icon: 'error',
                border: 'border-rose-500/30',
                bg: 'bg-[#240a0e]/90 text-rose-200',
                glow: 'shadow-[0_8px_30px_rgba(244,63,94,0.25)]',
                iconColor: 'text-rose-400'
            },
            warning: {
                icon: 'warning',
                border: 'border-amber-500/30',
                bg: 'bg-[#261706]/90 text-amber-200',
                glow: 'shadow-[0_8px_30px_rgba(245,158,11,0.25)]',
                iconColor: 'text-amber-400'
            },
            info: {
                icon: 'info',
                border: 'border-[#ff5540]/30',
                bg: 'bg-[#1a1c26]/90 text-white',
                glow: 'shadow-[0_8px_30px_rgba(255,85,64,0.25)]',
                iconColor: 'text-[#ff5540]'
            }
        };

        const cfg = typeConfigs[type] || typeConfigs.info;

        toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3.5 rounded-2xl border ${cfg.border} ${cfg.bg} ${cfg.glow} backdrop-blur-2xl transition-all duration-300 transform translate-y-[-10px] opacity-0 select-none`;
        toast.innerHTML = `
            <span class="material-symbols-outlined text-[22px] shrink-0 ${cfg.iconColor}" style="font-variation-settings: 'FILL' 1;">${cfg.icon}</span>
            <div class="text-xs sm:text-sm font-medium leading-relaxed flex-grow text-white/95">${message}</div>
            <button class="text-white/40 hover:text-white p-1 transition-colors shrink-0 flex items-center justify-center rounded-lg hover:bg-white/10" aria-label="Close">
                <span class="material-symbols-outlined text-[16px]">close</span>
            </button>
        `;

        const closeBtn = toast.querySelector('button');
        const dismiss = () => {
            toast.classList.add('opacity-0', 'translate-y-[-8px]', 'scale-95');
            setTimeout(() => toast.remove(), 250);
        };

        if (closeBtn) closeBtn.onclick = dismiss;

        container.appendChild(toast);
        requestAnimationFrame(() => {
            toast.classList.remove('translate-y-[-10px]', 'opacity-0');
        });

        setTimeout(dismiss, duration);
    };

    // Polite alert replacement: non-blocking toast
    const originalAlert = window.alert;
    window.alert = function(msg) {
        if (typeof msg === 'string' && msg.length < 200) {
            const isErr = /error|fail|invalid|denied|cannot/i.test(msg);
            const isSucc = /success|granted|saved|done|copied/i.test(msg);
            window.showToast(msg, isErr ? 'error' : (isSucc ? 'success' : 'info'));
        } else {
            originalAlert(msg);
        }
    };

    // ── 2. Ambient Cosmic Background Glows ────────────────────────
    function injectCosmicBackground() {
        if (document.getElementById('sv-cosmic-bg')) return;
        const bg = document.createElement('div');
        bg.id = 'sv-cosmic-bg';
        bg.className = 'fixed inset-0 pointer-events-none -z-10 overflow-hidden';
        bg.innerHTML = `
            <div class="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[550px] bg-gradient-to-b from-[#ff5540]/15 via-[#ff5540]/5 to-transparent blur-[130px] rounded-full pointer-events-none animate-sv-pulse"></div>
            <div class="absolute -bottom-40 -right-20 w-[650px] h-[650px] bg-[#0070eb]/10 blur-[150px] rounded-full pointer-events-none"></div>
            <div class="absolute top-1/3 -left-36 w-[550px] h-[550px] bg-[#ff5540]/6 blur-[120px] rounded-full pointer-events-none"></div>
        `;
        document.body.prepend(bg);
    }

    // ── 3. Real-time Platform URL Detection & Feedback ───────────
    function setupUrlDetection() {
        const input = document.getElementById('url-input');
        const analyzeBtn = document.getElementById('analyze-btn');
        const btnText = document.getElementById('analyze-btn-text');
        const btnIcon = document.getElementById('analyze-btn-icon');
        const youtubeTab = document.getElementById('tab-youtube');
        const socialTab = document.getElementById('tab-social');

        if (!input) return;

        function updatePlatformState() {
            const val = (input.value || '').trim();
            
            // Switch tabs if URL indicates platform
            if (/youtube\.com|youtu\.be/i.test(val)) {
                if (youtubeTab && !youtubeTab.classList.contains('text-primary')) youtubeTab.click();
            } else if (/instagram\.com|facebook\.com|fb\.watch|fb\.com|tiktok\.com/i.test(val)) {
                if (socialTab && !socialTab.classList.contains('text-primary')) socialTab.click();
            }

            // Update Analyze button label & visual cue
            if (analyzeBtn && btnText && btnIcon) {
                if (val.length > 5) {
                    btnText.innerText = 'Analyze & Download';
                    btnIcon.innerText = 'cloud_download';
                    analyzeBtn.classList.add('shadow-[0_0_25px_rgba(255,85,64,0.45)]', 'scale-[1.02]');
                } else {
                    btnText.innerText = 'Paste Link';
                    btnIcon.innerText = 'content_paste';
                    analyzeBtn.classList.remove('shadow-[0_0_25px_rgba(255,85,64,0.45)]', 'scale-[1.02]');
                }
            }
        }

        input.addEventListener('input', updatePlatformState);
        input.addEventListener('paste', () => setTimeout(updatePlatformState, 50));
    }

    // ── 4. Global Keyboard Shortcuts ──────────────────────────────
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Esc closes open modals & dropdowns
            if (e.key === 'Escape') {
                const modals = document.querySelectorAll('[id$="-modal"]:not(.hidden)');
                modals.forEach(m => m.classList.add('hidden'));
                const dropdowns = document.querySelectorAll('#user-dropdown:not(.hidden), #notif-dropdown:not(.hidden)');
                dropdowns.forEach(d => d.classList.add('hidden'));
            }

            // Cmd/Ctrl + K or / focuses URL search on main page
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                const input = document.getElementById('url-input');
                if (input) {
                    e.preventDefault();
                    input.focus();
                    input.select();
                }
            }
        });
    }

    // ── 5. Inject Global Styles for Glassmorphism & Animations ────
    function injectGlobalStyles() {
        if (document.getElementById('sv-pro-theme-styles')) return;
        const style = document.createElement('style');
        style.id = 'sv-pro-theme-styles';
        style.textContent = `
            @keyframes svPulse {
                0%, 100% { opacity: 0.35; transform: scale(1); }
                50% { opacity: 0.65; transform: scale(1.04); }
            }
            .animate-sv-pulse {
                animation: svPulse 7s ease-in-out infinite;
            }
            @keyframes svShimmer {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(200%); }
            }
            .shimmer-bar::after {
                content: '';
                position: absolute;
                inset: 0;
                transform: translateX(-100%);
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
                animation: svShimmer 2s infinite;
            }
            /* Smooth tactile active state */
            button, .btn-tactile {
                transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease, background-color 0.2s ease, border-color 0.2s ease !important;
            }
            button:active:not(:disabled), .btn-tactile:active {
                transform: scale(0.96) !important;
            }
            /* High-spec custom scrollbar */
            ::-webkit-scrollbar {
                width: 6px;
                height: 6px;
            }
            ::-webkit-scrollbar-track {
                background: transparent;
            }
            ::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.12);
                border-radius: 9999px;
            }
            ::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 85, 64, 0.5);
            }
            /* Specular glass highlight */
            .glass-specular {
                box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.5), inset 0 1px 0 0 rgba(255, 255, 255, 0.1);
            }
            .pro-badge-shimmer {
                background: linear-gradient(135deg, #ff5540 0%, #ff8a7a 50%, #ff5540 100%);
                background-size: 200% 200%;
                animation: svShimmer 3s ease infinite;
            }
        `;
        document.head.appendChild(style);
    }

    // ── 6. Initialization ─────────────────────────────────────────
    function init() {
        injectGlobalStyles();
        injectCosmicBackground();
        setupUrlDetection();
        setupKeyboardShortcuts();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
