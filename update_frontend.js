const fs = require('fs');

const path = 'C:/Users/DR Films/.gemini/antigravity-ide/scratch/streamvault-downloader/download-queue.html';
let content = fs.readFileSync(path, 'utf8');

// 1. Update Control Buttons HTML
const oldButtonsHtml = `                    <button class="btn-open-file px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/30 hover:bg-primary/30 text-xs text-primary transition-colors flex items-center gap-1 mr-1" title="Open Saved File">
                        <span class="material-symbols-outlined text-[16px]">play_arrow</span>
                        Play File
                    </button>
                    <button class="btn-open-folder px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-xs text-on-surface hover:text-primary transition-colors flex items-center gap-1" title="Open Download Folder">
                        <span class="material-symbols-outlined text-[16px]">folder_open</span>
                        Open Folder
                    </button>`;

const newButtonsHtml = `                    <button class="btn-save-device px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/30 hover:bg-primary/30 text-xs text-primary transition-colors flex items-center gap-1 mr-1" title="Save to Device">
                        <span class="material-symbols-outlined text-[16px]">save_alt</span>
                        Save to Device
                    </button>`;

content = content.replace(oldButtonsHtml, newButtonsHtml);

// 2. Update Event Listeners
const oldEventListeners = `            // Open File Event
            const openFileBtn = card.querySelector('.btn-open-file');
            if (openFileBtn) {
                openFileBtn.addEventListener('click', async () => {
                    const savePath = item.path || \`C:\\\\Users\\\\DR Films\\\\Downloads\\\\\${item.title.toLowerCase().endsWith('.mp4') ? item.title : item.title + '.mp4'}\`;
                    try {
                        const response = await fetch((window.API_BASE_URL || '') + '/api/open-file', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ path: savePath })
                        });
                        const data = await response.json();
                        if (data.error) {
                            showToast(\`Error: \${data.error}\`, "error");
                        } else {
                            showToast("Opening file in default player...", "success");
                        }
                    } catch (err) {
                        showToast(\`Failed to connect: \${err.message}\`, "error");
                    }
                });
            }

            // Open Folder Event
            const openFolderBtn = card.querySelector('.btn-open-folder');
            if (openFolderBtn) {
                openFolderBtn.addEventListener('click', async () => {
                    const savePath = item.path || \`C:\\\\Users\\\\DR Films\\\\Downloads\\\\\${item.title.toLowerCase().endsWith('.mp4') ? item.title : item.title + '.mp4'}\`;
                    try {
                        const response = await fetch((window.API_BASE_URL || '') + '/api/open-folder', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ path: savePath })
                        });
                        const data = await response.json();
                        if (data.error) {
                            showToast(\`Error: \${data.error}\`, "error");
                        } else {
                            showToast("Opening downloads folder...", "success");
                        }
                    } catch (err) {
                        showToast(\`Failed to connect: \${err.message}\`, "error");
                    }
                });
            }`;

const newEventListeners = `            // Save Device Event
            const saveBtn = card.querySelector('.btn-save-device');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    if (item.id.includes('default')) {
                        showToast("Demo file cannot be downloaded.", "error");
                        return;
                    }
                    showToast("Starting download...", "success");
                    // Trigger browser download by hitting the new delivery endpoint
                    window.location.href = '/api/fetch-file?id=' + item.id;
                });
            }`;

content = content.replace(oldEventListeners, newEventListeners);

// 3. Inject Auto-Download Trigger
const oldCompleteTrigger = `                                renderQueue();
                                showToast(\`✓ Saved: \${filename}\`, 'success');
                                resolve();`;

const newCompleteTrigger = `                                renderQueue();
                                showToast(\`✓ Ready! Downloading \${filename} to your device...\`, 'success');
                                
                                // Automatically trigger the browser download stream
                                const a = document.createElement('a');
                                a.href = '/api/fetch-file?id=' + item.id;
                                a.style.display = 'none';
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                
                                resolve();`;

content = content.replace(oldCompleteTrigger, newCompleteTrigger);

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully updated download-queue.html');
