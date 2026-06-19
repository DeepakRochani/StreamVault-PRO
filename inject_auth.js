const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'streamvault-upgrade.html');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add CSS
const cssToInject = `
        /* ── Auth Modal ── */
        .auth-overlay {
            position: fixed; inset: 0; z-index: 250;
            background: rgba(0,0,0,0.85); backdrop-filter: blur(12px);
            display: none; padding: 1rem;
            align-items: center; justify-content: center;
        }
        .auth-overlay.show { display: flex; }
        .auth-modal {
            background: var(--surface-high); border: 1px solid var(--border);
            border-radius: var(--radius); width: 100%; max-width: 450px;
            padding: 2.5rem; position: relative;
            animation: slideUp 0.3s ease;
        }
        .auth-tabs { display: flex; gap: 1rem; margin-bottom: 2rem; border-bottom: 1px solid var(--border); }
        .auth-tab { padding: 0.5rem 1rem; cursor: pointer; color: var(--text-muted); font-weight: 700; border-bottom: 2px solid transparent; }
        .auth-tab.active { color: var(--primary); border-bottom-color: var(--primary); }
        .auth-input {
            width: 100%; background: var(--surface); border: 1px solid var(--border);
            border-radius: 8px; padding: 0.8rem 1rem; color: var(--text); font-size: 0.95rem;
            margin-bottom: 1rem; outline: none; transition: border-color 0.2s;
        }
        .auth-input:focus { border-color: var(--primary); }
        .auth-btn {
            width: 100%; padding: 0.9rem; border-radius: 10px; font-size: 1rem; font-weight: 800;
            background: var(--primary); color: #fff; cursor: pointer; border: none; margin-top: 1rem;
            transition: all 0.2s; display: flex; justify-content: center; align-items: center; gap: 0.5rem;
        }
        .auth-btn:hover { opacity: 0.9; box-shadow: 0 0 20px var(--primary-glow); }
        .auth-msg { margin-top: 1rem; font-size: 0.85rem; text-align: center; }
`;
if (!content.includes('.auth-overlay')) {
    content = content.replace('/* ── Payment Modal ── */', cssToInject + '\n        /* ── Payment Modal ── */');
}

// 2. Add HTML
const htmlToInject = `
<!-- Auth Modal -->
<div class="auth-overlay" id="auth-modal">
    <div class="auth-modal">
        <button class="modal-close" onclick="closeAuthModal()">
            <span class="material-symbols-outlined">close</span>
        </button>
        <h2 style="margin-bottom: 0.5rem;">Access Required</h2>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 2rem;">Please sign in or create an account to purchase a subscription.</p>
        
        <div class="auth-tabs">
            <div class="auth-tab active" id="tab-login" onclick="switchAuthTab('login')">Log In</div>
            <div class="auth-tab" id="tab-signup" onclick="switchAuthTab('signup')">Sign Up</div>
        </div>

        <form id="auth-form" onsubmit="handleAuth(event)">
            <input type="email" id="auth-email" class="auth-input" placeholder="Email Address" required>
            <input type="password" id="auth-password" class="auth-input" placeholder="Password" required>
            <button type="submit" class="auth-btn" id="auth-submit-btn">
                <span>Continue</span>
            </button>
            <div id="auth-msg" class="auth-msg"></div>
        </form>
    </div>
</div>
`;
if (!content.includes('id="auth-modal"')) {
    content = content.replace('<!-- Payment Modal -->', htmlToInject + '\n<!-- Payment Modal -->');
}

// 3. Add JS
const jsToInject = `
// ─── Auth Logic ─────────────────────────────────────────────────────────────
let authMode = 'login';
window.pendingPayment = null;

function switchAuthTab(mode) {
    authMode = mode;
    document.getElementById('tab-login').classList.toggle('active', mode === 'login');
    document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
    document.getElementById('auth-submit-btn').querySelector('span').innerText = mode === 'login' ? 'Log In' : 'Sign Up';
    document.getElementById('auth-msg').innerText = '';
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.remove('show');
    window.pendingPayment = null;
}

async function handleAuth(e) {
    e.preventDefault();
    if (!window.supabaseClient) return alert('Supabase client not initialized');
    
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const btn = document.getElementById('auth-submit-btn');
    const msg = document.getElementById('auth-msg');
    
    btn.disabled = true;
    msg.innerText = 'Processing...';
    msg.style.color = 'var(--text-muted)';
    
    try {
        let result;
        if (authMode === 'login') {
            result = await window.supabaseClient.auth.signInWithPassword({ email, password });
        } else {
            result = await window.supabaseClient.auth.signUp({ email, password });
        }
        
        if (result.error) throw result.error;

        // Sync with backend to get local SQLite token cookie
        const syncRes = await fetch((window.API_BASE_URL || '') + '/api/auth/supabase-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: result.data.session.access_token })
        });
        const syncData = await syncRes.json();
        if (!syncData.success) throw new Error(syncData.error || 'Failed to sync with server');
        
        // Success
        msg.innerText = 'Success!';
        msg.style.color = 'var(--green)';
        
        setTimeout(() => {
            closeAuthModal();
            if (window.pendingPayment) {
                // Trigger the payment modal now that we are authenticated
                const p = window.pendingPayment;
                openPaymentModal(p.planId, p.cycle, p.amount, p.planName);
            }
        }, 1000);
        
    } catch(err) {
        msg.innerText = err.message;
        msg.style.color = 'var(--red)';
        btn.disabled = false;
    }
}

// Intercept openPayment to check auth first
const openPaymentModal = openPayment;
window.openPayment = async function(planId, cycle, amount, planName) {
    if (window.supabaseClient) {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) {
            window.pendingPayment = { planId, cycle, amount, planName };
            document.getElementById('auth-modal').classList.add('show');
            return;
        }
    }
    openPaymentModal(planId, cycle, amount, planName);
};
`;

if (!content.includes('function switchAuthTab')) {
    content = content.replace('// ─── Payment Flow ─────────────────────────────────────────────────────────────', jsToInject + '\n// ─── Payment Flow ─────────────────────────────────────────────────────────────');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully injected auth modal into streamvault-upgrade.html');

