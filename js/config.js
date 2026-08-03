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
window.SUPABASE_ANON_KEY = 'sb_publishable_t2N8YtpcPHjVFJzrMlLr5Q_pL9ppUiP';

// ── API base URL ──────────────────────────────────────────────
// Edge Function URLs: https://<project-ref>.supabase.co/functions/v1/<name>
// The frontend uses (window.API_BASE_URL + '/metadata') etc.

if (typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')) {
    window.API_BASE_URL = 'http://localhost:3000';
    console.log('[StreamVault Config] Local mode — API pointing to Local Server:', window.API_BASE_URL);
} else {
    window.API_BASE_URL = 'https://streamvault-pro-production.up.railway.app';
    console.log('[StreamVault Config] Production mode — API pointing to Railway:', window.API_BASE_URL);
}

// ── Supabase client init ──────────────────────────────────────
if (window.supabase) {
    window.supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
}
