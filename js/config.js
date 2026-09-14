// ============================================================
// StreamVault PRO — Global Configuration
// ============================================================
// Backend: Supabase Edge Functions
// Frontend: Vercel (static)
// Database/Auth: Supabase
// Download Engine: cobalt.tools (via Edge Function proxy)
// ============================================================

// ── Supabase project reference ───────────────────────────────
window.SUPABASE_PROJECT_REF = 'sjnamkshicpxtyikzsnp';

// ── Supabase Auth configuration ──────────────────────────────
window.SUPABASE_URL     = 'https://sjnamkshicpxtyikzsnp.supabase.co';
window.SUPABASE_ANON_KEY = 'sb_publishable_t2N8YtpcPHjVFJzrMlLr5Q_pL9ppUiP';

// ── API base URL ──────────────────────────────────────────────
// Desktop/Local mode: Local Express server on 127.0.0.1:10000
// Web/Production mode: Supabase Edge Functions or custom ENV_API_URL

if (typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')) {
    window.API_BASE_URL = window.ENV_API_URL || 'http://127.0.0.1:10000';
    console.log('[StreamVault Config] Local mode — API pointing to Local Server:', window.API_BASE_URL);
} else {
    window.API_BASE_URL = window.ENV_API_URL || `https://${window.SUPABASE_PROJECT_REF}.supabase.co/functions/v1`;
    console.log('[StreamVault Config] Production mode — API pointing to Edge Functions:', window.API_BASE_URL);
    
    // Intercept fetch to route /api/ endpoints correctly to Supabase Edge Functions in Web mode
    const originalFetch = window.fetch;
    window.fetch = async function() {
        if (typeof arguments[0] === 'string' && arguments[0].startsWith(window.API_BASE_URL + '/api/')) {
            arguments[0] = arguments[0].replace(window.API_BASE_URL + '/api/', window.API_BASE_URL + '/');
        }
        return originalFetch.apply(this, arguments);
    };
}

// ── Supabase client init ──────────────────────────────────────
if (window.supabase) {
    window.supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
}
