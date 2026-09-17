// ============================================================
// StreamVault PRO — Global Configuration
// ============================================================
// Backend: Supabase Edge Functions
// Frontend: Vercel / Cloudflare Pages (static)
// Database/Auth: Supabase
// Local Desktop: Express Server (127.0.0.1:10000)
// ============================================================

// ── Supabase project reference ───────────────────────────────
window.SUPABASE_PROJECT_REF = 'sjnamkshicpxtyikzsnp';

// ── Supabase Auth configuration ──────────────────────────────
window.SUPABASE_URL     = 'https://sjnamkshicpxtyikzsnp.supabase.co';
window.SUPABASE_ANON_KEY = 'sb_publishable_t2N8YtpcPHjVFJzrMlLr5Q_pL9ppUiP';

// ── Google OAuth Client Configuration ────────────────────────
window.GOOGLE_CLIENT_ID = '312739985705-hrn04fo2doa8dsn7573bg6dspt5eabh0.apps.googleusercontent.com';

// ── API base URL & Fetch Interceptor ─────────────────────────
if (typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')) {
    window.API_BASE_URL = window.ENV_API_URL || 'http://127.0.0.1:10000';
    console.log('[StreamVault Config] Local mode — API pointing to Local Server:', window.API_BASE_URL);
} else {
    window.API_BASE_URL = window.ENV_API_URL || `https://${window.SUPABASE_PROJECT_REF}.supabase.co/functions/v1`;
    console.log('[StreamVault Config] Production mode — API pointing to Edge Functions:', window.API_BASE_URL);
    
    // Intercept fetch in Web/Production mode:
    // 1. Rewrite /api/ endpoints to Supabase Edge Function endpoints
    // 2. Attach apikey & Authorization Bearer headers for Supabase Gateway authentication
    const originalFetch = window.fetch;
    window.fetch = async function(resource, init = {}) {
        let url = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');
        
        if (typeof url === 'string') {
            if (url.startsWith(window.API_BASE_URL + '/api/')) {
                url = url.replace(window.API_BASE_URL + '/api/', window.API_BASE_URL + '/');
            } else if (url.startsWith('/api/')) {
                url = window.API_BASE_URL + url.replace('/api/', '/');
            }

            if (url.includes('supabase.co/functions/v1/')) {
                init = init || {};
                const headers = new Headers(init.headers || {});
                if (!headers.has('apikey')) {
                    headers.set('apikey', window.SUPABASE_ANON_KEY);
                }
                if (!headers.has('Authorization')) {
                    headers.set('Authorization', 'Bearer ' + window.SUPABASE_ANON_KEY);
                }
                init.headers = headers;
            }
        }
        
        return originalFetch.call(this, url || resource, init);
    };
}

// ── Supabase client init ──────────────────────────────────────
if (window.supabase) {
    window.supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
}
