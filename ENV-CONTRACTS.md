# StreamVault PRO — Environment Variables Contract (ENV-CONTRACTS.md)

> [!IMPORTANT]
> **Zero-Secrets Policy for GitHub:** 
> Never commit real passwords, private tokens, or secret keys to GitHub.
> This file (`ENV-CONTRACTS.md`) serves as the official **specification and schema** of all environment variables used across StreamVault PRO. It only documents variable names, security tiers, and dummy placeholders so anyone inspecting the codebase knows what configuration is required without exposing real production credentials.

---

## 1. Security Classification Tiers

| Tier | Classification | Can Be On GitHub? | Accessible by Browser? | Examples |
| :--- | :--- | :---: | :---: | :--- |
| 🟢 **Tier 1: Public** | Client-Safe / Publishable | ✅ Yes (in code/config) | ✅ Yes | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GOOGLE_CLIENT_ID` |
| 🔴 **Tier 2: Secret** | Server-Only / Confidential | ❌ **NEVER** | ❌ **NEVER** | `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `GOOGLE_CLIENT_SECRET`, Database Passwords |

---

## 2. Environment Variables Specification Matrix

### 🟢 Tier 1: Public Frontend & Publishable Keys (Safe in Browser & GitHub)

These variables identify your public project endpoints and OAuth client apps. They are secured by backend Row-Level Security (RLS) policies and authorized OAuth redirect URIs.

| Variable Name | Required? | Default / Example Value | Where Stored | Description |
| :--- | :---: | :--- | :--- | :--- |
| `SUPABASE_URL` | **Yes** | `https://sjnamkshicpxtyikzsnp.supabase.co` | `js/config.js`, Vercel, `.env` | URL of the Supabase project backend |
| `SUPABASE_PROJECT_REF` | **Yes** | `sjnamkshicpxtyikzsnp` | `js/config.js`, Vercel | Project reference ID for Supabase services |
| `SUPABASE_ANON_KEY` | **Yes** | `eyJhbGciOiJIUzI1Ni...` (anon JWT) | `js/config.js`, Vercel, `.env` | Public client key protected by Supabase RLS |
| `SUPABASE_PUBLISHABLE_KEY` | Optional | `sb_publishable_...` | `js/config.js` | Supabase new publishable key format |
| `GOOGLE_CLIENT_ID` | Optional | `312739985705-...apps.googleusercontent.com` | `js/config.js`, `.env` | Public OAuth Client ID for Google Sign-In |
| `PORT` | Local only | `10000` | `.env` | Local desktop Express server port |
| `NODE_ENV` | Optional | `production` / `development` | System / Vercel | Node environment mode |

---

### 🔴 Tier 2: Confidential Server Secrets (STRICTLY FORBIDDEN ON GITHUB)

These keys have administrative or cryptographic power. If leaked, unauthorized users could access private user data or bypass security controls.

| Secret Name | Required? | Masked Dummy Example | Where It Must Be Stored | Danger if Leaked |
| :--- | :---: | :--- | :--- | :--- |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | `eyJhbGciOi...[HIDDEN]` | **Supabase Secrets only** | **CRITICAL:** Bypasses all Database RLS policies. NEVER put in frontend! |
| `JWT_SECRET` | For Local Node Server | `streamvault_sec_9f8a...[HIDDEN]` | **`.env` (local only)** or Vercel Secret | Attacker could forge user session tokens. |
| `GOOGLE_CLIENT_SECRET` | If Server-Side OAuth | `GOCSPX-...[HIDDEN]` | **Supabase Secrets / Server only** | Compromises backend OAuth exchange. |
| `STRIPE_SECRET_KEY` | If Billing enabled | `sk_live_...[HIDDEN]` | **Vercel / Supabase Secrets only** | Direct access to payments and financial data. |
| `DATABASE_URL` | Direct Postgres only | `postgresql://postgres:[PASS]@...` | **Vercel / Server only** | Full read/write database connection. |

---

## 3. Where Are Secrets Actually Stored?

```mermaid
flowchart TD
    subgraph Local_Computer["💻 Your Local Mac / PC (Private)"]
        LocalEnv[".env (Holds real secrets locally)"]
        GitIgnore[".gitignore (Prevents .env from reaching GitHub)"]
        LocalEnv -.->|BLOCKED BY| GitIgnore
    end

    subgraph GitHub["🐙 GitHub Repository (Public / Team)"]
        Repo[("StreamVault-PRO Repo")]
        ContractsDoc["ENV-CONTRACTS.md (Safe Guide)"]
        ExampleFile[".env.example (Safe Dummy Template)"]
        Repo --> ContractsDoc
        Repo --> ExampleFile
    end

    subgraph Production_Cloud["☁️ Production Cloud Platforms (Encrypted Vaults)"]
        VercelVault["Vercel Project Settings > Environment Variables"]
        SupabaseVault["Supabase Project Settings > Edge Functions > Secrets"]
    end

    GitIgnore =="NEVER PUSHED"==x Repo
    LocalEnv -.->|"Manually copied once to"| VercelVault
    LocalEnv -.->|"Manually copied once to"| SupabaseVault
```

### 1. Local Machine (Desktop / Development)
- **File:** `.env` located in the project root.
- **Protection:** `.gitignore` contains `.env` and `.env.*`.
- **Status:** Git completely ignores this file, so `git push origin main` will **never** upload it to GitHub.

### 2. Vercel Web Deployment (`stream-vault-pro.vercel.app`)
- **Where to configure:**
  1. Open [Vercel Dashboard](https://vercel.com).
  2. Select your `StreamVault-PRO` project.
  3. Navigate to **Settings** → **Environment Variables**.
  4. Add your key-value pairs there.
- **Status:** Encrypted at rest by Vercel; never exposed in source code.

### 3. Supabase Edge Functions (`download`, `metadata`, `auth`, `admin`)
- **Where to configure:**
  1. Open [Supabase Dashboard](https://supabase.com/dashboard).
  2. Select project `sjnamkshicpxtyikzsnp`.
  3. Navigate to **Project Settings** → **Edge Functions** → **Secrets** (or use Supabase CLI / MCP).
- **Status:** Injected directly into the Deno edge runtime via `Deno.env.get('SECRET_NAME')`.

---

## 4. How to Verify You Are Safe Before Pushing to GitHub

Before running `git push`, you can always verify your repository status:

```bash
# 1. Verify that .env is ignored and not tracked
git status

# 2. Check if any file with .env is tracked in git index (should only show .env.example)
git ls-files | grep -i "\.env"

# 3. Check for any accidental private key patterns in staged files
git diff --staged | grep -i "secret"
```

---

## 5. Emergency Runbook: What to Do If a Secret Is Ever Leaked

If you ever accidentally commit a secret key to GitHub:

1. **Immediate Revocation (Rotate Key):**
   - Go directly to the provider (Supabase, Google Cloud, Stripe).
   - Click **"Revoke"** or **"Roll Key"** immediately. Once rotated, the leaked key becomes completely invalid.
2. **Never Just Delete and Re-commit:**
   - Git maintains a permanent history. Simply deleting the line in a new commit leaves the secret in git history.
   - You must rotate the key in the service provider dashboard so the old key is dead.
3. **Update Cloud Environments:**
   - Paste the new key into Vercel and Supabase Secrets dashboards.
