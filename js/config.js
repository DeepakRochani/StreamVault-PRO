// ============================================================
// StreamVault PRO — Global Configuration
// ============================================================
// Backend: Supabase Edge Functions
// Frontend: Vercel (static)
// Database/Auth: Supabase
// Download Engine: cobalt.tools (via Edge Function proxy)
// ============================================================

// ── Supabase project reference ───────────────────────────────
window.SUPABASE_PROJECT_REF = 'xphhazisatxmlulhqxvi';

// ── Supabase Auth configuration ──────────────────────────────
window.SUPABASE_URL     = 'https://xphhazisatxmlulhqxvi.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwaGhhemlzYXR4bWx1bGhxeHZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MjE3MDgsImV4cCI6MjA5NzQ5NzcwOH0.AXKS6RQjzGJYCig5mzWoCwKQ6e27TWLX2GAlvTsInwM';

// ── API base URL ──────────────────────────────────────────────
// Edge Function URLs: https://<project-ref>.supabase.co/functions/v1/<name>
// The frontend uses (window.API_BASE_URL + '/metadata') etc.

if (typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')) {
    window.API_BASE_URL = 'http://localhost:3000';
    console.log('[StreamVault Config] Local mode — API pointing to Local Server:', window.API_BASE_URL);
} else {
    window.API_BASE_URL = `https://${window.SUPABASE_PROJECT_REF}.supabase.co/functions/v1`;
    console.log('[StreamVault Config] Production mode — API:', window.API_BASE_URL);
    
    // Intercept fetch to fix /api/ prefix for Supabase Edge Functions
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
