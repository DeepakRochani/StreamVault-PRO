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
    // Web / Vercel Production Mode:
    // Uses relative '/api' same-origin endpoints proxied by Vercel server-side to Supabase Edge Functions.
    // This avoids CORS preflights, prevents ad-blocker domain blocking, and ensures fast edge routing.
    window.API_BASE_URL = window.ENV_API_URL || '';
    window.SUPABASE_FUNCTIONS_URL = `https://${window.SUPABASE_PROJECT_REF}.supabase.co/functions/v1`;
    console.log('[StreamVault Config] Production mode — using same-origin /api with Supabase fallback');
    
    // Intercept fetch in Web/Production mode:
    // If a request hits supabase.co directly, attach apikey & Authorization Bearer headers.
    const originalFetch = window.fetch;
    window.fetch = async function(resource, init = {}) {
        let url = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');
        
        if (typeof url === 'string' && url.includes('supabase.co/functions/v1/')) {
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
        
        try {
            return await originalFetch.call(this, url || resource, init);
        } catch (fetchErr) {
            // Automatic failover: If relative /api/ endpoint fails to fetch, retry directly to Supabase Edge Function
            if (typeof url === 'string' && url.startsWith('/api/')) {
                const fallbackEndpoint = url.replace('/api/', '/');
                const directUrl = window.SUPABASE_FUNCTIONS_URL + fallbackEndpoint;
                console.warn(`[StreamVault] /api failed (${fetchErr.message}). Retrying direct Supabase fallback:`, directUrl);
                
                const fallbackHeaders = new Headers(init.headers || {});
                fallbackHeaders.set('apikey', window.SUPABASE_ANON_KEY);
                fallbackHeaders.set('Authorization', 'Bearer ' + window.SUPABASE_ANON_KEY);
                const fallbackInit = { ...init, headers: fallbackHeaders };
                
                return await originalFetch.call(this, directUrl, fallbackInit);
            }
            throw fetchErr;
        }
    };
}

// ── Supabase client init ──────────────────────────────────────
if (window.supabase) {
    window.supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
}
