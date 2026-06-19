// ============================================================
// StreamVault PRO — Global Configuration
// ============================================================
// Backend: Supabase Edge Functions
// Frontend: Vercel (static)
// Database/Auth: Supabase
// Download Engine: cobalt.tools (via Edge Function proxy)
// ============================================================

// ── Supabase project reference ───────────────────────────────
window.SUPABASE_PROJECT_REF = 'fmgybyjmgnhionbmthfb';

// ── Supabase Auth configuration ──────────────────────────────
window.SUPABASE_URL     = 'https://fmgybyjmgnhionbmthfb.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtZ3lieWptZ25oaW9uYm10aGZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MzIzMTgsImV4cCI6MjA5NzAwODMxOH0.sjJao3V21yfrwEi3m1M5UlzOg_CIR_Y1isvVovKQD18';

// ── API base URL ──────────────────────────────────────────────
// Edge Function URLs: https://<project-ref>.supabase.co/functions/v1/<name>
// The frontend uses (window.API_BASE_URL + '/metadata') etc.

if (typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')) {
    window.API_BASE_URL = 'http://localhost:3000';
    console.log('[StreamVault Config] Local mode — API pointing to Local Server:', window.API_BASE_URL);
} else {
    window.API_BASE_URL = `https://${window.SUPABASE_PROJECT_REF}.supabase.co/functions/v1`;
    console.log('[StreamVault Config] Production mode — API:', window.API_BASE_URL);
}

// ── Supabase client init ──────────────────────────────────────
if (window.supabase) {
    window.supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
}
