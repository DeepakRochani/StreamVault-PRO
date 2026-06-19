







        tailwind.config = {

          darkMode: "class",
          theme: {
            extend: {
              "colors": {
                      "outline-variant": "#603e39",
                      "primary-container": "#ff5540",
                      "surface-container-lowest": "#060e20",
                      "on-secondary-fixed": "#001a41",
                      "surface-container-highest": "#2d3449",
                      "on-secondary": "#002e69",
                      "on-tertiary-fixed": "#3d0025",
                      "on-secondary-fixed-variant": "#004493",
                      "on-tertiary-fixed-variant": "#8b005a",
                      "surface-variant": "#2d3449",
                      "surface-container-high": "#222a3d",
                      "secondary-fixed": "#d8e2ff",
                      "on-primary-fixed": "#410000",
                      "primary-fixed": "#ffdad4",
                      "on-error": "#690005",
                      "tertiary": "#ffafd2",
                      "surface-dim": "#0b1326",
                      "inverse-on-surface": "#283044",
                      "error": "#ffb4ab",
                      "secondary-container": "#0070eb",
                      "surface-bright": "#31394d",
                      "on-primary-fixed-variant": "#930100",
                      "surface": "#0b1326",
                      "secondary": "#adc6ff",
                      "error-container": "#93000a",
                      "inverse-primary": "#c00100",
                      "outline": "#b18780",
                      "on-surface-variant": "#ebbbb4",
                      "inverse-surface": "#dae2fd",
                      "tertiary-fixed-dim": "#ffafd2",
                      "on-secondary-container": "#fefcff",
                      "primary-fixed-dim": "#ffb4a8",
                      "tertiary-fixed": "#ffd8e6",
                      "surface-tint": "#ffb4a8",
                      "secondary-fixed-dim": "#adc6ff",
                      "background": "#0b1326",
                      "on-tertiary-container": "#570036",
                      "on-primary-container": "#5c0000",
                      "tertiary-container": "#ed5aa8",
                      "surface-container-low": "#131b2e",
                      "on-tertiary": "#63003f",
                      "primary": "#ffb4a8",
                      "on-background": "#dae2fd",
                      "surface-container": "#171f33",
                      "on-surface": "#dae2fd",
                      "on-error-container": "#ffdad6",
                      "on-primary": "#690100"
              },
              "borderRadius": {
                      "DEFAULT": "0.25rem",
                      "lg": "0.5rem",
                      "xl": "0.75rem",
                      "full": "9999px"
              },
              "spacing": {
                      "gutter": "16px",
                      "margin-mobile": "16px",
                      "container-max": "1200px",
                      "base": "4px",
                      "margin-desktop": "32px"
              },
              "fontFamily": {
                      "title-md": [
                              "Hanken Grotesk"
                      ],
                      "mono-sm": [
                              "Geist"
                      ],
                      "display-lg": [
                              "Hanken Grotesk"
                      ],
                      "label-md": [
                              "Geist"
                      ],
                      "headline-lg-mobile": [
                              "Hanken Grotesk"
                      ],
                      "headline-lg": [
                              "Hanken Grotesk"
                      ],
                      "body-lg": [
                              "Inter"
                      ],
                      "body-sm": [
                              "Inter"
                      ]
              },
              "fontSize": {
                      "title-md": [
                              "20px",
                              {
                                      "lineHeight": "28px",
                                      "fontWeight": "600"
                              }
                      ],
                      "mono-sm": [
                              "13px",
                              {
                                      "lineHeight": "18px",
                                      "fontWeight": "500"
                              }
                      ],
                      "display-lg": [
                              "48px",
                              {
                                      "lineHeight": "56px",
                                      "letterSpacing": "-0.02em",
                                      "fontWeight": "800"
                              }
                      ],
                      "label-md": [
                              "12px",
                              {
                                      "lineHeight": "16px",
                                      "letterSpacing": "0.05em",
                                      "fontWeight": "600"
                              }
                      ],
                      "headline-lg-mobile": [
                              "24px",
                              {
                                      "lineHeight": "32px",
                                      "fontWeight": "700"
                              }
                      ],
                      "headline-lg": [
                              "32px",
                              {
                                      "lineHeight": "40px",
                                      "letterSpacing": "-0.01em",
                                      "fontWeight": "700"
                              }
                      ],
                      "body-lg": [
                              "16px",
                              {
                                      "lineHeight": "24px",
                                      "fontWeight": "400"
                              }
                      ],
                      "body-sm": [
                              "14px",
                              {
                                      "lineHeight": "20px",
                                      "fontWeight": "400"
                              }
                      ]
              }
      },
          },
        }
      




    let isMenuOpen = false;
    const authBtn = document.getElementById('auth-btn');
    const dropdown = document.getElementById('user-dropdown');
    
    function toggleMenu(e) {
        if(e) e.stopPropagation();
        isMenuOpen = !isMenuOpen;
        dropdown.classList.toggle('hidden', !isMenuOpen);
    }
    
    let isNotifOpen = false;
    const notifBtn = document.getElementById('notif-btn');
    const notifDropdown = document.getElementById('notif-dropdown');

    function toggleNotifs(e) {
        if(e) e.stopPropagation();
        isNotifOpen = !isNotifOpen;
        notifDropdown.classList.toggle('hidden', !isNotifOpen);
        if(isNotifOpen) {
            isMenuOpen = false;
            dropdown.classList.add('hidden');
        }
    }

    async function markRead(id, el) {
        try {
            const res = await fetch((window.API_BASE_URL || '') + `/api/notifications/${id}/read`, { method: 'POST' });
            if ((await res.json()).success) {
                el.classList.remove('bg-primary/5');
                el.classList.add('opacity-50');
                const badge = document.getElementById('notif-badge');
                let count = parseInt(badge.innerText) || 1;
                count--;
                if(count <= 0) badge.classList.add('hidden');
                else badge.innerText = count;
            }
        } catch(e) {}
    }

    document.addEventListener('click', (e) => {
        if(isMenuOpen && !dropdown.contains(e.target) && !authBtn.contains(e.target)) {
            isMenuOpen = false;
            dropdown.classList.add('hidden');
        }
        if(isNotifOpen && !notifDropdown.contains(e.target) && !notifBtn.contains(e.target)) {
            isNotifOpen = false;
            notifDropdown.classList.add('hidden');
        }
    });

    async function logout() {
        await fetch((window.API_BASE_URL || '') + '/api/auth/logout', { method: 'POST' });
        window.location.href = 'streamvault-welcome.html';
    }

    window.isLoggedIn = false;
    fetch((window.API_BASE_URL || '') + '/api/auth/me').then(r => r.json()).then(data => {
        window.isLoggedIn = data.loggedIn;
        if(data.loggedIn) {
            authBtn.onclick = toggleMenu;
            authBtn.className = "w-10 h-10 rounded-xl bg-primary-container/20 flex items-center justify-center border border-primary/20 text-primary font-bold hover:bg-primary-container/30 transition-colors";
            authBtn.innerHTML = (data.user.name || data.user.email).substring(0, 2).toUpperCase();
            
            document.getElementById('ud-name').innerText = data.user.name || 'User';
            document.getElementById('ud-email').innerText = data.user.email;

            // Load Notifications
            document.getElementById('notif-container').classList.remove('hidden');
            const notifs = data.user.notifications || [];
            if(notifs.length > 0) {
                const badge = document.getElementById('notif-badge');
                badge.classList.remove('hidden');
                badge.innerText = notifs.length;
                badge.className = "absolute top-1 right-1 w-4 h-4 text-[9px] font-bold bg-primary text-on-primary rounded-full flex items-center justify-center";
                
                const list = document.getElementById('notif-list');
                list.innerHTML = '';
                notifs.forEach(n => {
                    const icon = n.priority === 'high' ? 'warning' : 'info';
                    const col = n.priority === 'high' ? 'text-red-400' : 'text-primary';
                    list.innerHTML += `
                        <div class="p-4 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer bg-primary/5" onclick="markRead('${n.id}', this)">
                            <div class="flex gap-3">
                                <span class="material-symbols-outlined mt-0.5 ${col} text-[20px]">${icon}</span>
                                <div>
                                    <p class="font-bold text-sm text-on-surface">${n.title}</p>
                                    <p class="text-xs text-on-surface-variant mt-1 leading-relaxed">${n.message}</p>
                                    <p class="text-[10px] text-on-surface-variant mt-2">${new Date(n.created_at).toLocaleDateString()}</p>
                                </div>
                            </div>
                        </div>
                    `;
                });
            }

            // Show upgrade banner for free users
            const checkAndShowBanner = () => {
                if ((!data.user.subscription || data.user.subscription.plan_id === 'free') && window.subscriptionEnabled !== false) {
                    const banner = document.getElementById('upgrade-banner');
                    if (banner) {
                        banner.classList.remove('hidden');
                        banner.classList.add('flex');
                    }
                }
            };
            if (typeof window.subscriptionEnabled !== 'undefined') checkAndShowBanner();
            else window.onSettingsLoaded = checkAndShowBanner;

            // Auto-Resume Workflow
            if (sessionStorage.getItem('resumeState')) {
                try {
                    const state = JSON.parse(sessionStorage.getItem('resumeState'));
                    sessionStorage.removeItem('resumeState');
                    if (state.url) {
                        document.getElementById('url-input').value = state.url;
                        if (state.tab === 'social') document.getElementById('tab-social').click();
                        setTimeout(() => {
                            if(typeof window.handlePasteOrAnalyze === 'function') window.handlePasteOrAnalyze();
                        }, 300);
                    }
                } catch(e) {}
            }
        } else {
            // Guest Mode
            const histSection = document.getElementById('history-section');
            if(histSection) {
                histSection.innerHTML = `
                <div class="w-full bg-surface-container/50 border border-white/5 rounded-2xl p-5 flex flex-col items-center justify-center text-center relative overflow-hidden">
                    <div class="absolute inset-0 bg-gradient-to-b from-transparent to-surface-container pointer-events-none"></div>
                    <span class="material-symbols-outlined text-[48px] text-on-surface-variant mb-4 relative z-10">lock</span>
                    <h3 class="font-title-md text-xl text-on-surface font-bold relative z-10 mb-2">History & Sync Locked</h3>
                    <p class="text-sm text-on-surface-variant max-w-sm relative z-10 mb-4" id="guest-promo-text">Create an account to sync your downloads across devices and access Premium features.</p>
                    <a href="streamvault-login.html?mode=register" class="bg-primary hover:bg-primary-container text-[#5c0000] font-bold px-4 py-2 rounded-xl transition-all relative z-10">Create Free Account</a>
                </div>`;
                
                const checkAndHidePromo = () => {
                    if (window.subscriptionEnabled === false) {
                        const promoText = document.getElementById('guest-promo-text');
                        if (promoText) promoText.innerText = "Create an account to sync your downloads across devices.";
                    }
                };
                if (typeof window.subscriptionEnabled !== 'undefined') checkAndHidePromo();
                else {
                    const oldOnLoad = window.onSettingsLoaded;
                    window.onSettingsLoaded = () => { if(oldOnLoad) oldOnLoad(); checkAndHidePromo(); };
                }
            }
        }
    }).catch(e=>{});


    document.addEventListener('DOMContentLoaded', () => {
        // Navigation routing
        document.querySelectorAll('.nav-home').forEach(el => {
            el.addEventListener('click', () => { window.location.href = 'index.html'; });
        });
        document.querySelectorAll('.nav-downloads').forEach(el => {
            el.addEventListener('click', () => { window.location.href = 'download-queue.html'; });
        });
        document.querySelectorAll('.nav-settings').forEach(el => {
            el.addEventListener('click', () => { window.location.href = 'app-settings.html'; });
        });

        // ─── GLOBAL PASTE / ANALYZE HANDLER ──────────────────────────────
        window.handlePasteOrAnalyze = async function() {
            const inp  = document.getElementById('url-input');
            const icon = document.getElementById('analyze-btn-icon');
            const txt  = document.getElementById('analyze-btn-text');
            const errBox = document.getElementById('error-container');
            const errMsg = document.getElementById('error-message');

            const showErr = (m) => { if(errBox && errMsg){ errMsg.textContent = m; errBox.classList.remove('hidden'); } };
            const hideErr = ()  => { if(errBox) errBox.classList.add('hidden'); };

            // If input already has text → run Analyze
            if (inp && inp.value.trim().length > 0) {
                hideErr();
                if (typeof triggerParse === 'function') triggerParse();
                return;
            }

            // Strategy 1: Modern Clipboard API
            if (navigator.clipboard && navigator.clipboard.readText) {
                try {
                    const text = await navigator.clipboard.readText();
                    if (text && text.trim()) {
                        inp.value = text.trim();
                        inp.dispatchEvent(new Event('input', { bubbles: true }));
                        if(icon){ icon.textContent = 'search'; }
                        if(txt){ txt.textContent = 'Analyze'; }
                        hideErr();
                        inp.focus();
                        return;
                    }
                } catch(e) { /* blocked, fall through */ }
            }

            // Strategy 2: Focus input and dispatch paste event (works from user gesture)
            inp.focus();
            const beforeVal = inp.value;
            try {
                document.execCommand('paste');
            } catch(e) { /* ignore */ }

            // Give execCommand a tick to fill the input
            setTimeout(() => {
                if (inp.value.trim() !== beforeVal.trim() && inp.value.trim().length > 0) {
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                    if(icon){ icon.textContent = 'search'; }
                    if(txt){ txt.textContent = 'Analyze'; }
                    hideErr();
                    return;
                }

                // Strategy 3: Nothing worked — show clear tip
                showErr('Click inside the box below and press Ctrl+V to paste your link');
                inp.style.boxShadow = '0 0 0 3px rgba(255,85,64,0.6)';
                setTimeout(() => { inp.style.boxShadow = ''; }, 2500);
            }, 100);
        };

        // ─── URL INPUT + KEYBOARD LISTENERS ───────────────────────────────
        const urlInput = document.getElementById('url-input');
        const analyzeBtn = document.getElementById('analyze-btn');

        function updateAnalyzeBtnState() {
            const icon = document.getElementById('analyze-btn-icon');
            const txt  = document.getElementById('analyze-btn-text');
            if (!icon || !txt) return;
            if (urlInput && urlInput.value.trim().length > 0) {
                icon.textContent = 'search';
                icon.classList.remove('animate-spin');
                txt.textContent  = 'Analyze';
            } else {
                icon.textContent = 'content_paste';
                icon.classList.remove('animate-spin');
                txt.textContent  = 'Paste Link';
            }
        }

        if (urlInput) {
            let analyzeDebounceTimer = null;
            urlInput.addEventListener('input', (e) => {
                updateAnalyzeBtnState();
                
                clearTimeout(analyzeDebounceTimer);
                const val = e.target.value.trim();
                
                // Only auto-analyze if URL is present
                if (val.length > 0) {
                    analyzeDebounceTimer = setTimeout(() => {
                        const check = window.URLParser.detectPlatform(val);
                        if (check.valid && ['youtube', 'instagram', 'facebook', 'direct'].includes(check.type)) {
                            triggerParse();
                        }
                    }, 500); // 500ms debounce
                }
            });
            urlInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter' && typeof triggerParse === 'function') {
                    clearTimeout(analyzeDebounceTimer);
                    triggerParse();
                }
            });
            urlInput.focus();
        }

        // Trending cards redirect
        document.querySelectorAll('.snap-start.shrink-0.w-72').forEach((card, index) => {
            card.addEventListener('click', () => {
                triggerParse();
            });
        });

        // Tab State Logic
        let activePlatformTab = 'youtube';
        const tabIndicator = document.getElementById('tab-indicator');
        const tabYoutube = document.getElementById('tab-youtube');
        const tabSocial = document.getElementById('tab-social');
        const formatWrapper = document.getElementById('format-section-wrapper');
        const step2Label = document.getElementById('step-2-label') || document.querySelector('h3:nth-of-type(2)');
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.dataset.tab;
                if (activePlatformTab === target) return;
                activePlatformTab = target;
                
                // Update styling
                if (target === 'youtube') {
                    tabIndicator.style.transform = 'translateX(0%)';
                    tabYoutube.classList.add('text-primary', 'font-bold');
                    tabYoutube.classList.remove('text-on-surface-variant', 'font-normal');
                    tabSocial.classList.add('text-on-surface-variant', 'font-normal');
                    tabSocial.classList.remove('text-primary', 'font-bold');
                    urlInput.placeholder = "Paste media URL here (e.g., YouTube)...";
                    
                    // Show Format
                    formatWrapper.classList.remove('hidden');
                    if(step2Label) step2Label.innerHTML = `<span class="material-symbols-outlined text-primary">high_quality</span> 2. Select Quality`;
                } else {
                    tabIndicator.style.transform = 'translateX(100%)';
                    tabSocial.classList.add('text-primary', 'font-bold');
                    tabSocial.classList.remove('text-on-surface-variant', 'font-normal');
                    tabYoutube.classList.add('text-on-surface-variant', 'font-normal');
                    tabYoutube.classList.remove('text-primary', 'font-bold');
                    urlInput.placeholder = "Paste Instagram or Facebook URL here...";
                    // Show Format for both platforms so selection can happen
                    formatWrapper.classList.remove('hidden');
                    if(step2Label) step2Label.innerHTML = `<span class="material-symbols-outlined text-primary">high_quality</span> 2. Select Quality`;
                }
            });
        });

        function getYouTubeId(url) {
            try {
                const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|\&v=)([^#\&\?]*).*/;
                const match = url.match(regExp);
                if (match && match[2].length === 11) {
                    return match[2];
                }
            } catch (e) {
                console.error("[StreamVault] Error parsing YouTube ID:", e);
            }
            return null;
        }

        let currentAnalyzeController = null;

        async function triggerParse() {
            if (!analyzeBtn) return;
            const val = (urlInput.value || '').trim();
            if (!val) return;
            
            try {
            
            if (!window.isLoggedIn && window.loginEnabled === true) {
                showLoginModal();
                return;
            }

            // Cancel previous analysis if URL changes
            if (currentAnalyzeController) {
                currentAnalyzeController.abort();
                currentAnalyzeController = null;
            }

            const errorContainer = document.getElementById('error-container');
            const errorMsg = document.getElementById('error-message');
            
            // Reset Error UI
            if (errorContainer) errorContainer.classList.add('hidden');
            
            console.log(`[StreamVault] Initiating link parsing for: "${val}"`);

            const t0 = performance.now();
            analyzeBtn.disabled = true;
            analyzeBtn.innerHTML = '<span id="analyze-btn-icon" class="material-symbols-outlined animate-spin">sync</span> <span id="analyze-btn-text">Detecting URL...</span>';

            // 1. Detect Platform
            const check = window.URLParser.detectPlatform(val);
            const t1 = performance.now();
            console.log(`[Perf] Platform Detection: ${(t1 - t0).toFixed(2)} ms`);

            // STRICT TAB VALIDATION
            if (activePlatformTab === 'youtube') {
                if (check.type === 'instagram' || check.type === 'facebook') {
                    if (errorContainer && errorMsg) {
                        errorMsg.innerHTML = 'This appears to be an Instagram/Facebook link. <a href="javascript:void(0)" onclick="document.getElementById(\'tab-social\').click(); setTimeout(()=>window.handlePasteOrAnalyze(), 100);" class="underline font-bold hover:text-white ml-2">[ Switch To Instagram/Facebook Tab ]</a>';
                        errorContainer.classList.remove('hidden');
                    }
                    analyzeBtn.disabled = false;
                    updateAnalyzeBtnState();
                    return;
                }
                if (check.type !== 'youtube' && check.type !== 'direct') {
                    if (errorContainer && errorMsg) {
                        errorMsg.textContent = 'Please enter a valid YouTube URL.';
                        errorContainer.classList.remove('hidden');
                    }
                    analyzeBtn.disabled = false;
                    updateAnalyzeBtnState();
                    return;
                }
            } else if (activePlatformTab === 'social') {
                if (check.type === 'youtube') {
                    if (errorContainer && errorMsg) {
                        errorMsg.innerHTML = 'This appears to be a YouTube link. <a href="javascript:void(0)" onclick="document.getElementById(\'tab-youtube\').click(); setTimeout(()=>window.handlePasteOrAnalyze(), 100);" class="underline font-bold hover:text-white ml-2">[ Switch To YouTube Tab ]</a>';
                        errorContainer.classList.remove('hidden');
                    }
                    analyzeBtn.disabled = false;
                    updateAnalyzeBtnState();
                    return;
                }
                if (check.type !== 'instagram' && check.type !== 'facebook' && check.type !== 'direct') {
                    if (errorContainer && errorMsg) {
                        errorMsg.textContent = 'Please enter a valid Instagram or Facebook URL.';
                        errorContainer.classList.remove('hidden');
                    }
                    analyzeBtn.disabled = false;
                    updateAnalyzeBtnState();
                    return;
                }
            }

            if (!check.valid) {
                console.error(`[StreamVault] URL Validation Failed. Reason: "${check.reason}"`);
                if (errorContainer && errorMsg) {
                    errorMsg.textContent = check.reason || "Invalid URL detected.";
                    errorContainer.classList.remove('hidden');
                }
                analyzeBtn.disabled = false;
                updateAnalyzeBtnState();
                return;
            }

            // Prepare pending video object early to avoid ReferenceError
            let pendingVideo = {
                title: "Loading Stream...",
                platform: check.type === 'youtube' ? 'YouTube' : check.type === 'instagram' ? 'Instagram' : check.type === 'facebook' ? 'Facebook' : 'Web Stream',
                thumbnail: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400&auto=format&fit=crop",
                url: check.normalizedUrl,
                directDownload: check.type === 'direct',
                restricted: false,
                sizes: null
            };

            // Progressive UI Loading: Show Workflow Section Immediately
            document.getElementById('video-title').textContent = pendingVideo.title;
            document.getElementById('video-platform-badge').textContent = pendingVideo.platform || 'Web';
            
            const thumbImg = document.getElementById('video-thumbnail');
            if (pendingVideo.thumbnail) {
                thumbImg.src = Array.isArray(pendingVideo.thumbnail) ? (pendingVideo.thumbnail[0]?.url || '') : pendingVideo.thumbnail;
                thumbImg.style.display = 'block';
            } else {
                thumbImg.style.display = 'none';
                thumbImg.src = '';
            }
            
            if (pendingVideo.directDownload) {
                document.getElementById('direct-stream-info').classList.remove('hidden');
            } else {
                document.getElementById('direct-stream-info').classList.add('hidden');
            }

            document.getElementById('download-workflow-section').classList.remove('hidden');
            document.getElementById('download-workflow-section').classList.add('flex');
            
            // Scroll down quickly
            document.getElementById('download-workflow-section').scrollIntoView({ behavior: 'smooth', block: 'start' });

            // 2. Fetch Metadata
            analyzeBtn.innerHTML = '<span id="analyze-btn-icon" class="material-symbols-outlined animate-spin">sync</span> <span id="analyze-btn-text">Analyzing...</span>';
            const t2 = performance.now();
            currentAnalyzeController = new AbortController();

            if (!pendingVideo.directDownload) {
                try {
                    const isSocial = check.type === 'facebook' || check.type === 'instagram';
                    const apiEndpoint = isSocial ? '/api/social/metadata' : '/api/metadata';
                    const response = await fetch((window.API_BASE_URL || '') + apiEndpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: check.normalizedUrl, type: check.type }),
                        signal: currentAnalyzeController.signal
                    });
                    if (response.ok) {
                        const data = await response.json();
                        if (data.title && data.title !== 'NA') pendingVideo.title = data.title;
                        if (data.thumbnail && data.thumbnail !== 'NA') pendingVideo.thumbnail = data.thumbnail;
                        if (data.sizes) pendingVideo.sizes = data.sizes;
                        if (data.videoFormats) pendingVideo.videoFormats = data.videoFormats;
                        if (data.audioFormats) pendingVideo.audioFormats = data.audioFormats;
                        
                        if (data.debug) {
                            pendingVideo.yt_dlp_command = data.debug.yt_dlp_command;
                            pendingVideo.exit_code = data.debug.exit_code;
                            pendingVideo.stdout = data.debug.stdout;
                            pendingVideo.stderr = data.debug.stderr;
                        }
                        
                        if (data.extractionError) {
                            console.error("[Diagnostics] Backend Extraction Error:", data.extractionError);
                        }
                        
                        const totalFormats = (data.videoFormats?.length || 0) + (data.audioFormats?.length || 0);
                        console.log(`[Diagnostics] FORMATS_FOUND = ${totalFormats}`);
                        if (data.videoFormats?.length > 0) {
                            console.log("[Diagnostics] yt-dlp format list:", data.videoFormats);
                        }
                    } else {
                         if (response.status === 429) {
                             const errData = await response.json().catch(() => ({}));
                             showLimitModal(errData.error || 'Daily Limit Reached');
                             updateAnalyzeBtnState();
                             return;
                         }
                         let errData = {};
                         let rawText = '';
                         try {
                             rawText = await response.text();
                             errData = JSON.parse(rawText);
                         } catch (e) {
                             errData = { 
                                 actual_error: `HTTP ${response.status} ${response.statusText}\n\n${rawText.substring(0, 500)}`,
                                 stderr: `HTTP ${response.status} ${response.statusText}`,
                                 stdout: rawText,
                                 exit_code: response.status,
                                 yt_dlp_command: 'N/A'
                             };
                         }
                         // Expose server errors directly to the user in the UI format block
                         if (errData.actual_error || errData.error || errData.details) {
                             pendingVideo.extractionError = errData.actual_error || errData.details || errData.error;
                             pendingVideo.yt_dlp_command = errData.yt_dlp_command;
                             pendingVideo.exit_code = errData.exit_code;
                             pendingVideo.stdout = errData.stdout;
                             pendingVideo.stderr = errData.stderr;
                         }

                         if (isSocial) {
                             alert(`Failed: ${errData.error || 'Extraction Error'}\n\n${errData.details || ''}`);
                             analyzeBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">search</span> <span class="font-semibold tracking-wide">Analyze</span>';
                             analyzeBtn.disabled = false;
                             urlInput.disabled = false;
                             return;
                         }
                         
                         // Fallback for YouTube
                         if (check.type === 'youtube') {
                             try {
                                 const noembedRes = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(check.normalizedUrl)}`);
                                 if (noembedRes.ok) {
                                     const noembedData = await noembedRes.json();
                                     if (noembedData.title) pendingVideo.title = noembedData.title;
                                     if (noembedData.thumbnail_url) pendingVideo.thumbnail = noembedData.thumbnail_url;
                                 }
                             } catch(err) {}
                         }
                    }
                } catch(e) {
                    if (e.name === 'AbortError') {
                        console.log("[StreamVault] Analysis aborted due to URL change.");
                        return; // Exit silently
                    }
                    console.warn("[StreamVault] Failed to fetch metadata", e);
                    throw new Error("Network error or backend unreachable. Please try again.");
                }
            } else {
                try {
                    const urlObj = new URL(check.normalizedUrl);
                    pendingVideo.title = urlObj.pathname.split('/').pop() || "Direct Video Stream";
                } catch (e) {
                    pendingVideo.title = "Direct Video Stream.mp4";
                }
            }

            const t3 = performance.now();
            console.log(`[Perf] Metadata Fetch: ${(t3 - t2).toFixed(2)} ms`);
            
            analyzeBtn.innerHTML = '<span id="analyze-btn-icon" class="material-symbols-outlined animate-spin">sync</span> <span id="analyze-btn-text">Loading formats...</span>';

            // 3. Finalize UI Update
            setTimeout(() => {
                const t4 = performance.now();
                analyzeBtn.disabled = false;
                
                // Show final ready state
                analyzeBtn.innerHTML = '<span id="analyze-btn-icon" class="material-symbols-outlined">check_circle</span> <span id="analyze-btn-text">Ready</span>';
                
                document.getElementById('video-title').textContent = pendingVideo.title;
                const finalThumb = document.getElementById('video-thumbnail');
                if (pendingVideo.thumbnail) {
                    finalThumb.src = Array.isArray(pendingVideo.thumbnail) ? (pendingVideo.thumbnail[0]?.url || '') : pendingVideo.thumbnail;
                    finalThumb.style.display = 'block';
                } else {
                    finalThumb.style.display = 'none';
                    finalThumb.src = '';
                }

                if (pendingVideo.restricted) {
                    document.getElementById('restricted-warning').classList.remove('hidden');
                } else {
                    document.getElementById('restricted-warning').classList.add('hidden');
                }

                const t5 = performance.now();
                console.log(`[Perf] Quality Render & UI Finalize: ${(t5 - t4).toFixed(2)} ms`);
                console.log(`[Perf] Total Time: ${(t5 - t0).toFixed(2)} ms`);

                // Initialize the workflow with fetched data
                initializeWorkflow(pendingVideo);

                // Auto-focus quality selection
                const qualitySection = document.getElementById('quality-section');
                if (qualitySection) {
                    qualitySection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    qualitySection.classList.add('ring-2', 'ring-primary', 'rounded-xl', 'transition-all');
                    setTimeout(() => qualitySection.classList.remove('ring-2', 'ring-primary'), 2000);
                }
            }, 50);

            } catch (err) {
                console.error("[StreamVault] Critical Error in triggerParse:", err);
                const errorContainer = document.getElementById('error-container');
                const errorMsg = document.getElementById('error-message');
                if (errorContainer && errorMsg) {
                    errorMsg.textContent = "An error occurred during detection: " + (err.message || "Unknown error");
                    errorContainer.classList.remove('hidden');
                }
                
                if (analyzeBtn) {
                    analyzeBtn.disabled = false;
                    analyzeBtn.innerHTML = '<span id="analyze-btn-icon" class="material-symbols-outlined">search</span> <span id="analyze-btn-text">Analyze</span>';
                }
            }
        }

        // Setup Selection Logic
        function initializeWorkflow(videoData) {
            let validation = {
                urlValid: true,
                platformDetected: !!videoData.platform,
                formatSelected: true,
                qualitySelected: true
            };
            
            let selectedFormat = 'mp4';
            let selectedQuality = 'Original';

            const formatRadios = document.querySelectorAll('.format-radio');
            const mp4Options = document.getElementById('mp4-options');
            const mp3Options = document.getElementById('mp3-options');
            const qualitySection = document.getElementById('quality-section');
            const startBtn = document.getElementById('btn-start-download');

            function updateDiagnostics() {
                // Diagnostics panel removed — just update the button state
                const ready = validation.urlValid && validation.platformDetected && validation.formatSelected && validation.qualitySelected;
                const currentBtn = document.getElementById('btn-start-download');
                if (currentBtn) currentBtn.disabled = !ready;
            }

            function createQualityChip(type, name, value, sizeStr, isRecommended=false, extraDetails='') {
                return `
                    <label class="relative cursor-pointer group">
                        <input class="sr-only quality-radio" name="${type}_quality" type="radio" value="${value}" data-size="${sizeStr}"/>
                        <div class="glass-panel rounded-xl p-4 flex items-center justify-between transition-all duration-200 border-2 border-transparent group-hover:border-white/20 quality-card relative overflow-hidden bg-surface-container-high/50">
                            <div class="flex items-center gap-4">
                                <div class="w-5 h-5 rounded-full border-2 border-outline-variant flex items-center justify-center radio-border">
                                    <div class="w-2.5 h-2.5 rounded-full bg-transparent transform scale-0 transition-transform duration-200 radio-inner"></div>
                                </div>
                                <div>
                                    <div class="flex items-center gap-2 mb-1">
                                        <span class="font-title-md text-title-md text-on-surface">${name}</span>
                                        ${isRecommended ? '<span class="bg-primary/20 text-primary px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase">Recommended</span>' : ''}
                                    </div>
                                    ${extraDetails ? `<div class="text-xs text-on-surface-variant/70 font-medium tracking-wide mt-1">${extraDetails}</div>` : ''}
                                </div>
                            </div>
                            <div class="flex items-center gap-4">
                                <span class="font-title-md text-title-md text-on-surface">~ ${sizeStr}</span>
                                <span class="material-symbols-outlined text-primary opacity-0 check-icon transition-opacity">check_circle</span>
                            </div>
                        </div>
                    </label>
                `;
            }

            function buildQualityUI(format) {
                let html = '';
                let count = 0;
                
                if (format === 'mp4') {
                    if (videoData.videoFormats && videoData.videoFormats.length > 0) {
                        videoData.videoFormats.forEach(f => {
                            let details = [];
                            if (f.resolution && f.resolution !== f.quality) details.push(f.resolution);
                            if (f.fps) details.push(f.fps);
                            if (f.codec && f.codec !== 'Unknown') details.push(f.codec);
                            
                            html += createQualityChip('video', f.quality, f.id, f.sizeStr, f.recommended, details.join(' • '));
                            count++;
                        });
                    } else {
                        const sizes = videoData.sizes || {};
                        if (sizes.Original) { html += createQualityChip('video', 'Original Quality', 'Original', sizes.Original, true); count++; }
                        if (sizes.v4k && !sizes.Original) { html += createQualityChip('video', '4K', '4k', sizes.v4k, true); count++; }
                        if (sizes.v1080) { html += createQualityChip('video', '1080p', '1080p', sizes.v1080); count++; }
                        if (sizes.v720) { html += createQualityChip('video', '720p', '720p', sizes.v720); count++; }
                        if (sizes.v480) { html += createQualityChip('video', '480p', '480p', sizes.v480); count++; }
                    }
                    if (count === 0) { 
                        const actualErr = videoData.extractionError || videoData.stderr || "No explicit stderr returned. (Check stdout)";
                        const cmd = videoData.yt_dlp_command ? `\n> ${videoData.yt_dlp_command}` : '';
                        const extCode = videoData.exit_code !== undefined ? `\nExit Code: ${videoData.exit_code}` : '';
                        html += `
                        <div class="glass-panel rounded-xl p-4 flex flex-col items-center justify-center border border-error/30 bg-error/10 w-full text-center">
                            <span class="text-error font-title-md">EXTRACTION FAILED</span>
                            <span class="text-sm text-error/80 mt-2 block break-all font-mono text-left w-full bg-surface/50 p-2 rounded whitespace-pre-wrap">${actualErr}</span>
                            <button type="button" onclick="document.getElementById('debug-modal-${format}').classList.toggle('hidden')" class="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded border border-white/20 text-xs font-mono transition-colors text-white">Show Extraction Debug</button>
                        </div>
                        <div id="debug-modal-${format}" class="hidden w-full mt-4 flex flex-col gap-2 text-left">
                            <div class="text-xs font-mono text-on-surface-variant bg-surface/80 p-3 rounded-lg overflow-x-auto border border-outline/30">
                                <div class="text-primary font-bold mb-1">COMMAND EXECUTED:</div>
                                ${cmd}<br><br>
                                <div class="text-primary font-bold mb-1">EXIT CODE:</div>
                                ${extCode}<br><br>
                                <div class="text-primary font-bold mb-1">STDERR:</div>
                                <pre class="whitespace-pre-wrap text-error/90">${videoData.stderr || 'N/A'}</pre><br>
                                <div class="text-primary font-bold mb-1">STDOUT (First 1000 chars):</div>
                                <pre class="whitespace-pre-wrap">${videoData.stdout ? videoData.stdout.substring(0, 1000) : 'N/A'}</pre>
                            </div>
                        </div>`; 
                    }
                    mp4Options.innerHTML = html;
                } else {
                    if (videoData.audioFormats && videoData.audioFormats.length > 0) {
                        videoData.audioFormats.forEach(f => {
                            html += createQualityChip('audio', f.quality, f.id, f.sizeStr, f.recommended);
                            count++;
                        });
                    } else {
                        const sizes = videoData.sizes || {};
                        if (sizes.a640) { html += createQualityChip('audio', '640 kbps', '640K', sizes.a640, true); count++; }
                        if (sizes.a320) { html += createQualityChip('audio', '320 kbps', '320K', sizes.a320, !sizes.a640); count++; }
                        if (sizes.a192) { html += createQualityChip('audio', '192 kbps', '192K', sizes.a192); count++; }
                        if (sizes.a128) { html += createQualityChip('audio', '128 kbps', '128K', sizes.a128); count++; }
                        if (sizes.a64) { html += createQualityChip('audio', '64 kbps', '64K', sizes.a64); count++; }
                    }
                    if (count === 0) { 
                        const actualErr = videoData.extractionError || videoData.stderr || "No explicit stderr returned. (Check stdout)";
                        const cmd = videoData.yt_dlp_command ? `\n> ${videoData.yt_dlp_command}` : '';
                        const extCode = videoData.exit_code !== undefined ? `\nExit Code: ${videoData.exit_code}` : '';
                        html += `
                        <div class="glass-panel rounded-xl p-4 flex flex-col items-center justify-center border border-error/30 bg-error/10 w-full text-center">
                            <span class="text-error font-title-md">EXTRACTION FAILED</span>
                            <span class="text-sm text-error/80 mt-2 block break-all font-mono text-left w-full bg-surface/50 p-2 rounded whitespace-pre-wrap">${actualErr}</span>
                            <button type="button" onclick="document.getElementById('debug-modal-${format}').classList.toggle('hidden')" class="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded border border-white/20 text-xs font-mono transition-colors text-white">Show Extraction Debug</button>
                        </div>
                        <div id="debug-modal-${format}" class="hidden w-full mt-4 flex flex-col gap-2 text-left">
                            <div class="text-xs font-mono text-on-surface-variant bg-surface/80 p-3 rounded-lg overflow-x-auto border border-outline/30">
                                <div class="text-primary font-bold mb-1">COMMAND EXECUTED:</div>
                                ${cmd}<br><br>
                                <div class="text-primary font-bold mb-1">EXIT CODE:</div>
                                ${extCode}<br><br>
                                <div class="text-primary font-bold mb-1">STDERR:</div>
                                <pre class="whitespace-pre-wrap text-error/90">${videoData.stderr || 'N/A'}</pre><br>
                                <div class="text-primary font-bold mb-1">STDOUT (First 1000 chars):</div>
                                <pre class="whitespace-pre-wrap">${videoData.stdout ? videoData.stdout.substring(0, 1000) : 'N/A'}</pre>
                            </div>
                        </div>`; 
                    }
                    mp3Options.innerHTML = html;
                }
                
                // Hide download button if no formats available
                if (count === 0) {
                    startBtn.classList.add('hidden');
                } else {
                    startBtn.classList.remove('hidden');
                }

                // Re-attach listeners to dynamically generated radios
                const container = format === 'mp4' ? mp4Options : mp3Options;
                const newRadios = container.querySelectorAll('.quality-radio');
                newRadios.forEach(radio => {
                    radio.addEventListener('change', (e) => {
                        selectedQuality = e.target.value;
                        validation.qualitySelected = true;
                        updateDiagnostics();
                    });
                });
                
                // Auto-select first quality if available
                setTimeout(() => {
                    const firstQuality = container.querySelector('.quality-radio');
                    if (firstQuality && !firstQuality.checked) {
                        firstQuality.click();
                    }
                }, 50);
            }

                // Reset UI — button disabled until format + quality selected
                startBtn.disabled = true;
                qualitySection.classList.add('hidden', 'opacity-0');
                qualitySection.classList.remove('flex');
                formatRadios.forEach(r => r.checked = false);
                updateDiagnostics();

            // STEP 1: Attach format radio listeners FIRST before any auto-selection
            formatRadios.forEach(radio => {
                radio.addEventListener('change', (e) => {
                    selectedFormat = e.target.value;
                    selectedQuality = null;
                    validation.formatSelected = true;
                    validation.qualitySelected = false;
                    updateDiagnostics();

                    // Show Quality Section
                    qualitySection.classList.remove('hidden');
                    qualitySection.classList.add('flex');
                    setTimeout(() => qualitySection.classList.remove('opacity-0'), 50);

                    // Toggle mp4 / mp3 containers
                    if (selectedFormat === 'mp4') {
                        mp3Options.classList.add('hidden');
                        mp3Options.classList.remove('flex');
                        mp4Options.classList.remove('hidden');
                        mp4Options.classList.add('flex');
                    } else {
                        mp4Options.classList.add('hidden');
                        mp4Options.classList.remove('flex');
                        mp3Options.classList.add('hidden');
                        mp3Options.classList.remove('flex');
                        mp3Options.classList.remove('hidden');
                        mp3Options.classList.add('flex');
                    }

                    buildQualityUI(selectedFormat);
                });
            });

            // STEP 2: Auto-select appropriate tab to trigger everything
            const hasVideo = videoData.videoFormats && videoData.videoFormats.length > 0;
            const hasAudio = videoData.audioFormats && videoData.audioFormats.length > 0;
            const fallbackToAudio = !hasVideo && hasAudio;
            
            const targetFormat = fallbackToAudio ? 'mp3' : 'mp4';
            const targetRadio = document.querySelector(`input[name="format"][value="${targetFormat}"]`);
            if (targetRadio) {
                targetRadio.click();
            }

            // Re-bind click listener cleanly to avoid duplicates
            const newStartBtn = startBtn.cloneNode(true);
            startBtn.parentNode.replaceChild(newStartBtn, startBtn);
            
            newStartBtn.addEventListener('click', () => {
                startInlineDownload(videoData, selectedFormat, selectedQuality);
            });
        }

        function formatSize(bytes) {
            if (bytes === 0 || isNaN(bytes)) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        async function startInlineDownload(videoData, format, selectedQuality) {
            if (!window.isLoggedIn && window.loginEnabled === true) {
                showLoginModal();
                return;
            }
            
            // --- REWARDED AD LOGIC ---
            const userSub = (window.currentUser && window.currentUser.subscription) ? window.currentUser.subscription.plan_id : 'free';
            const isFreeUser = !window.isLoggedIn || userSub === 'free';
            
            if (window.rewardedAdsEnabled === 'true' && isFreeUser && window.subscriptionEnabled !== false) {
                const now = Date.now();
                const cooldownMins = parseInt(window.rewardedAdCooldown) || 15;
                const freqDl = parseInt(window.rewardedAdFrequency) || 3;
                
                const lastAdTime = parseInt(localStorage.getItem('sv_last_rewarded_ad')) || 0;
                let dlCount = parseInt(localStorage.getItem('sv_dl_since_ad')) || 0;
                
                const minsSinceLastAd = (now - lastAdTime) / (1000 * 60);
                const needsAd = (minsSinceLastAd >= cooldownMins) || (dlCount >= freqDl);
                
                if (needsAd) {
                    const modal = document.getElementById('rewarded-ad-modal');
                    if (modal) {
                        modal.classList.remove('hidden');
                        modal.classList.add('flex');
                        
                        const timerEl = document.getElementById('rewarded-ad-timer');
                        const skipBtn = document.getElementById('btn-skip-rewarded');
                        
                        let timeLeft = 5;
                        timerEl.innerText = '05';
                        skipBtn.disabled = true;
                        skipBtn.innerText = 'Skip Ad & Download';
                        
                        // Force hide ads underneath
                        if (typeof window.toggleAds === 'function') window.toggleAds(false);
                        
                        fetch((window.API_BASE_URL || '') + '/api/ads/track', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({location:'rewarded_video', type:'shown'})}).catch(e=>{});
                        
                        return new Promise(resolve => {
                            const interval = setInterval(() => {
                                timeLeft--;
                                timerEl.innerText = '0' + timeLeft;
                                if (timeLeft <= 0) {
                                    clearInterval(interval);
                                    skipBtn.disabled = false;
                                    skipBtn.innerText = 'Continue to Download';
                                }
                            }, 1000);
                            
                            skipBtn.onclick = () => {
                                clearInterval(interval);
                                modal.classList.remove('flex');
                                modal.classList.add('hidden');
                                
                                fetch((window.API_BASE_URL || '') + '/api/ads/track', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({location:'rewarded_video', type:'completed'})}).catch(e=>{});
                                
                                localStorage.setItem('sv_last_rewarded_ad', Date.now());
                                localStorage.setItem('sv_dl_since_ad', 1); // Count this download
                                
                                resolve(_executeInlineDownload(videoData, format, selectedQuality));
                            };
                        });
                    }
                } else {
                    localStorage.setItem('sv_dl_since_ad', dlCount + 1);
                }
            }
            // --- END REWARDED AD LOGIC ---

            return _executeInlineDownload(videoData, format, selectedQuality);
        }

        async function _executeInlineDownload(videoData, format, selectedQuality) {
            if (typeof window.toggleAds === 'function') window.toggleAds(false); // Hide ads during active download
            
            const stepsContainer = document.getElementById('selection-steps-container');
            const progressSection = document.getElementById('inline-progress-section');
            const statusText = document.getElementById('dl-status-text');
            const speedText = document.getElementById('dl-speed');
            const sizeInfo = document.getElementById('dl-size-info');
            const pctText = document.getElementById('dl-percentage');
            const progressBar = document.getElementById('dl-progress-bar');
            const openFolderBtn = document.getElementById('btn-open-folder');
            const downloadAnotherBtn = document.getElementById('btn-download-another');

            // Switch to Downloading State
            stepsContainer.classList.add('hidden');
            progressSection.classList.remove('hidden');
            progressSection.classList.add('flex');
            
            const downloadId = 'dl-' + Date.now();
            let filename = videoData.title;
            const isAudio = format === 'mp3';
            if (!filename.toLowerCase().endsWith('.mp4') && !filename.toLowerCase().endsWith('.mp3') && !filename.toLowerCase().endsWith('.webm')) {
                filename += isAudio ? '.mp3' : '.mp4';
            }

            try {
                const parsedUrl = URLParser.detectPlatform(videoData.url);
                const isSocial = parsedUrl.type === 'facebook' || parsedUrl.type === 'instagram';
                const dlEndpoint = isSocial ? '/api/social/download' : '/api/download';
                
                let formatUrl = null;
                let formatId = selectedQuality;
                if (isSocial && videoData.videoFormats) {
                    const matchedFormat = videoData.videoFormats.find(f => f.format_id === selectedQuality);
                    if (matchedFormat && matchedFormat.url) formatUrl = matchedFormat.url;
                }

                // Initiate Download API
                const startResponse = await fetch((window.API_BASE_URL || '') + dlEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        url: videoData.url,
                        filename: filename,
                        id: downloadId,
                        format: isAudio ? 'audio' : 'video',
                        quality: selectedQuality,
                        format_url: formatUrl,
                        format_id: formatId
                    })
                });

                if (!startResponse.ok) {
                    const errData = await startResponse.json().catch(() => ({}));
                    if (startResponse.status === 429) {
                        showLimitModal(errData.error || 'Daily Download Limit Reached');
                        statusText.innerHTML = `<span class="material-symbols-outlined text-[14px]">error</span> Limit Reached`;
                        statusText.classList.replace('text-primary', 'text-error');
                        downloadAnotherBtn.classList.remove('hidden');
                        return;
                    }
                    console.error("Initiation failed details:", errData);
                    throw new Error(`API: ${dlEndpoint}\nStatus: ${startResponse.status}\nError: ${errData.error || 'Unknown Backend Error'}\nMessage: ${errData.message || 'N/A'}\nDetails: ${errData.details || 'N/A'}`);
                }

                // Poll for status
                const pollInterval = setInterval(async () => {
                    try {
                        const statusRes = await fetch((window.API_BASE_URL || '') + `/api/download-status?id=${downloadId}`);
                        if (!statusRes.ok) return;
                        
                        const statusData = await statusRes.json();
                        
                        // Update UI
                        pctText.textContent = `${Math.round(statusData.progress)}%`;
                        progressBar.style.width = `${statusData.progress}%`;
                        speedText.textContent = statusData.speed || '0 MB/s';
                        
                        let displaySize = '--';
                        let loadedSize = '0 MB';
                        if (statusData.contentLength) {
                            let sizeStr = statusData.contentLength.replace('MiB', ' MB').replace('KiB', ' KB').replace('GiB', ' GB').replace('~', '').trim();
                            displaySize = sizeStr;
                            let numericSize = parseFloat(sizeStr);
                            if (!isNaN(numericSize) && statusData.progress) {
                                let loadedNumeric = (numericSize * (statusData.progress / 100)).toFixed(2);
                                let unit = sizeStr.replace(/[\d\.\s]/g, '');
                                loadedSize = `${loadedNumeric} ${unit}`;
                            }
                        }
                        sizeInfo.textContent = `${loadedSize} / ${displaySize}`;

                        if (statusData.status === 'completed') {
                            clearInterval(pollInterval);
                            statusText.innerHTML = '<span class="material-symbols-outlined text-[14px] animate-spin">sync</span> Verifying File Integrity...';
                            
                            try {
                                const verifyRes = await fetch((window.API_BASE_URL || '') + '/api/verify-file', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ path: statusData.path })
                                });
                                const verifyData = await verifyRes.json();
                                
                                if (verifyData.success) {
                                    statusText.innerHTML = '<span class="material-symbols-outlined text-[14px] animate-spin">sync</span> Opening Save Dialog...';
                                    statusText.classList.replace('text-primary', 'text-green-400');
                                    progressBar.classList.replace('bg-gradient-to-r', 'bg-green-500');
                                    speedText.textContent = '0 MB/s';
                                    downloadAnotherBtn.classList.remove('hidden');
                                    document.getElementById('dl-complete-ad-wrapper').classList.remove('hidden');
                                    
                                    // Save to queue history
                                    saveToQueueHistory(videoData, filename, downloadId, format, statusData.path, true);
                                    
                                    window.lastDownloadPath = statusData.path;
                                    
                                    // Trigger Native Save Dialog Workflow
                                    triggerDownloaderSave(downloadId, filename, statusData.path, statusText);
                                } else {
                                    throw new Error(verifyData.error || 'Verification failed');
                                }
                            } catch (verifyErr) {
                                statusText.innerHTML = `<span class="material-symbols-outlined text-[14px]">error</span> Download Failed: ${verifyErr.message}`;
                                statusText.classList.replace('text-primary', 'text-red-400');
                                progressBar.classList.replace('bg-gradient-to-r', 'bg-red-500');
                                downloadAnotherBtn.classList.remove('hidden');
                                saveToQueueHistory(videoData, filename, downloadId, format, null, false);
                            }
                        } else if (statusData.status === 'failed') {
                            clearInterval(pollInterval);
                            const errStr = statusData.error || 'Unknown error';
                            statusText.innerHTML = `<span class="material-symbols-outlined text-[14px]">error</span> Failed: ${errStr}`;
                            statusText.classList.replace('text-primary', 'text-red-400');
                            progressBar.classList.replace('bg-gradient-to-r', 'bg-red-500');
                            downloadAnotherBtn.classList.remove('hidden');
                            
                            saveToQueueHistory(videoData, filename, downloadId, format, null, false);
                        } else {
                            statusText.innerHTML = '<span class="material-symbols-outlined text-[14px] animate-spin">sync</span> Downloading...';
                        }
                    } catch (e) {
                        console.warn("Status poll error", e);
                    }
                }, 500);

            } catch (err) {
                console.error("Download Error:", err);
                statusText.innerHTML = "Download Failed:<br><pre class='text-xs mt-2 text-left bg-black/20 p-2 rounded whitespace-pre-wrap'>" + err.message + "</pre>";
                statusText.classList.replace('text-primary', 'text-red-400');
                progressBar.classList.replace('bg-gradient-to-r', 'bg-red-500');
                downloadAnotherBtn.classList.remove('hidden');
                alert("Download failed to initiate. Please check the console for details.");
            }

            downloadAnotherBtn.onclick = () => {
                document.getElementById('download-workflow-section').classList.add('hidden');
                document.getElementById('download-workflow-section').classList.remove('flex');
                progressSection.classList.add('hidden');
                progressSection.classList.remove('flex');
                stepsContainer.classList.remove('hidden');
                stepsContainer.classList.add('flex');
                
                // Hide manual save and reset if visible
                const mContainer = document.getElementById('dl-manual-save-container');
                if (mContainer) {
                    mContainer.classList.add('hidden');
                    mContainer.classList.remove('flex');
                }
                
                // Reset UI
                statusText.classList.replace('text-green-400', 'text-primary');
                statusText.classList.replace('text-red-400', 'text-primary');
                progressBar.classList.replace('bg-green-500', 'bg-gradient-to-r');
                progressBar.classList.replace('bg-red-500', 'bg-gradient-to-r');
                progressBar.style.width = '0%';
                pctText.textContent = '0%';
                downloadAnotherBtn.classList.add('hidden');
                const uiInput = document.getElementById('url-input');
                uiInput.value = '';
                uiInput.focus();
                
                // Trigger button state update to switch it back to "Paste Link"
                if (typeof updateAnalyzeBtnState === 'function') {
                    updateAnalyzeBtnState();
                }
            };
        }

        function saveToQueueHistory(videoData, filename, id, format, path, success) {
            const queue = JSON.parse(localStorage.getItem('download_queue') || '[]');
            queue.unshift({
                id: id,
                title: filename,
                size: '--',
                speed: '0 MB/s',
                progress: success ? 100 : 0,
                status: success ? 'completed' : 'failed',
                thumbnail: videoData.thumbnail || '',
                quality: format.toUpperCase(),
                duration: '--',
                directDownload: videoData.directDownload,
                url: videoData.url,
                isAudioOnly: format === 'mp3',
                path: path,
                downloadTriggered: true // Do not auto-retry
            });
            localStorage.setItem('download_queue', JSON.stringify(queue));
        }
        
    }); // Close DOMContentLoaded

    // Define global functions so they can be called from inline onclick handlers (e.g., manualSaveDownloader)
    async function triggerDownloaderSave(downloadId, defaultName, sourcePath, statusText) {
        console.log('BROWSER_DOWNLOAD_TRIGGERED');

        try {
            statusText.innerHTML = '<span class="material-symbols-outlined text-[14px] animate-spin">sync</span> Preparing File...';
            
            const downloadUrl = `/api/serve-file?path=${encodeURIComponent(sourcePath)}&filename=${encodeURIComponent(defaultName)}`;
            
            // Create a hidden anchor tag to trigger the browser's native download manager

            const response = await fetch(downloadUrl);
            if (!response.ok) throw new Error('File download failed');
            
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = objectUrl;
            a.download = defaultName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(objectUrl);

            
            console.log('SAVE_PATH_SELECTED');
            console.log('FILE_DOWNLOAD_TRIGGERED');
            
            statusText.innerHTML = `<span class="material-symbols-outlined text-[14px]">check_circle</span> File Ready for Download<br><span class="text-xs text-on-surface-variant break-all">Check your browser's download manager.</span>`;
            statusText.classList.replace('text-yellow-400', 'text-green-400');
            
            setTimeout(() => {
                if(typeof autoResetDownloader === 'function') autoResetDownloader();
            }, 2000);
            
        } catch (err) {
            try { clearTimeout(timeoutId); } catch(e) {}
            
            if (err.name === 'AbortError') {
                console.log('TIMEOUT_TRIGGERED');
                statusText.innerHTML = '<span class="material-symbols-outlined text-[14px] text-error">error</span> Dialog Failed to Open';
                statusText.classList.replace('text-green-400', 'text-error');
                
                let mContainer = document.getElementById('dl-manual-save-container');
                if (mContainer) {
                    mContainer.classList.remove('hidden');
                    mContainer.classList.add('flex');
                    mContainer.dataset.dlId = downloadId;
                }
                return;
            }
            
            alert("Save error: " + err.message);
            statusText.innerHTML = '<span class="material-symbols-outlined text-[14px] text-error">error</span> Save Failed';
            statusText.classList.replace('text-green-400', 'text-error');
        }
    }
    
    async function manualSaveDownloader() {
        const mContainer = document.getElementById('dl-manual-save-container');
        const downloadId = mContainer.dataset.dlId;
        const manualPath = document.getElementById('dl-manual-save-path').value.trim();
        
        if (!manualPath) return alert("Please enter a valid path.");
        
        const statusText = document.getElementById('dl-status-text');
        
        try {
            // Re-trigger via URL
            const sourcePath = window.lastDownloadPath || ''; // We need to store this or we can't do manual re-download easily
            
            if (!sourcePath) return alert("Source file path lost. Please download again.");
            
            // We check the manual save path from the input (although it's mainly for backend saves if implemented, here it triggers browser save)
            // But we must verify the SOURCE file exists on the backend first!
            const verifyRes = await fetch((window.API_BASE_URL || '') + '/api/verify-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: sourcePath })
            });
            const verifyData = await verifyRes.json();
            
            if (!verifyData.success) {
                return alert("Cannot save: " + verifyData.error);
            }
            
            const downloadUrl = `/api/serve-file?path=${encodeURIComponent(sourcePath)}&filename=download_retry.mp4`;
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = downloadUrl;
            a.download = "download_retry.mp4";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            statusText.innerHTML = `<span class="material-symbols-outlined text-[14px]">check_circle</span> File Ready for Download<br><span class="text-xs text-on-surface-variant break-all">Check your browser's download manager.</span>`;
            statusText.classList.replace('text-error', 'text-green-400');
            
            mContainer.classList.add('hidden');
            mContainer.classList.remove('flex');
            
            setTimeout(() => {
                if(typeof autoResetDownloader === 'function') autoResetDownloader();
            }, 2000);
        } catch(e) {
            alert("Save failed: " + e.message);
        }
    }
    

        function showToast(message) {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = 'bg-green-500/90 text-white px-4 py-2 rounded-full shadow-lg font-sans font-semibold text-sm backdrop-blur-md transition-all duration-300 transform translate-y-full opacity-0 flex items-center gap-2';
            toast.innerHTML = `<span class="material-symbols-outlined text-[18px]">check_circle</span> ${message}`;
            container.appendChild(toast);
            
            setTimeout(() => {
                toast.classList.remove('translate-y-full', 'opacity-0');
                toast.classList.add('translate-y-0', 'opacity-100');
            }, 10);
            
            setTimeout(() => {
                toast.classList.remove('translate-y-0', 'opacity-100');
                toast.classList.add('translate-y-full', 'opacity-0');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        async function autoResetDownloader() {
            showToast("Download Completed Successfully");
            if (typeof window.toggleAds === 'function') window.toggleAds(true); // Re-enable ads on complete
            setTimeout(async () => {
                // Clear backend cache
                const inputUrl = document.getElementById('url-input').value;
                if (inputUrl) {
                    await fetch((window.API_BASE_URL || '') + '/api/metadata', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: inputUrl })
                    }).catch(()=>{});
                }
                
                // Hard refresh the page for a clean slate for the next download
                window.location.reload();
            }, 2500);
        }

        // Login Required Logic
        function showLoginModal() {
            document.getElementById('login-required-modal').classList.remove('hidden');
            fetch((window.API_BASE_URL || '') + '/api/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'Download Requests Blocked', details: 'Guest attempted action without login' })
            }).catch(e=>{});
        }

        function saveStateAndRedirect(mode) {
            const val = (document.getElementById('url-input').value || '').trim();
            sessionStorage.setItem('resumeState', JSON.stringify({
                url: val,
                tab: activePlatformTab
            }));
            sessionStorage.setItem('redirectUrl', window.location.href);
            window.location.href = 'streamvault-login.html' + (mode ? '?mode=' + mode : '');
        }
    

        function showLimitModal(msg) {
            document.getElementById('limit-reached-msg').innerText = msg;
            document.getElementById('limit-reached-modal').classList.remove('hidden');
            
            // Hide the upgrade button if the subscription system is disabled globally
            if (window.subscriptionEnabled === false) {
                const upBtn = document.getElementById('btn-upgrade-limit');
                if (upBtn) upBtn.style.display = 'none';
            }
        }
    

        function setFbRating(val) {
            document.getElementById('fb-rating').value = val;
            const stars = document.querySelectorAll('.fb-star');
            stars.forEach((s, i) => {
                if (i < val) s.classList.add('text-yellow-400');
                else s.classList.remove('text-yellow-400');
            });
        }
        
        async function submitFeedback() {
            const type = document.getElementById('fb-type').value;
            const rating = document.getElementById('fb-rating').value;
            const message = document.getElementById('fb-msg').value.trim();
            
            if(!message) return alert("Please enter a message");
            
            try {
                const res = await fetch((window.API_BASE_URL || '') + '/api/feedback', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ type, rating: rating > 0 ? parseInt(rating) : null, message })
                });
                if(res.ok) {
                    alert('Feedback submitted successfully. Thank you!');
                    document.getElementById('feedback-modal').classList.add('hidden');
                    document.getElementById('fb-msg').value = '';
                    setFbRating(0);
                } else {
                    const err = await res.json();
                    alert(err.error || 'Failed to submit feedback. Please ensure you are logged in.');
                }
            } catch(e) {
                alert('Network error');
            }
        }
    