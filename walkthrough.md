# Migration Walkthrough: Direct Supabase Client + Native Vercel Serverless Functions

We have successfully migrated the architecture from a combined Express/Vercel serverless proxy model to a clean, decoupled design where:
1. The **React frontend** communicates directly with Supabase via `@supabase/supabase-js` for reads.
2. High-privilege actions (event creation/deletion, manual student registration, bulk CSV imports, ticket email resends, email previews) run securely in standalone **Vercel native serverless functions** using the database service role key to bypass **Row Level Security (RLS)** constraints.

---

## 🛠️ Changes Implemented

### 1. New Vercel Serverless API Endpoints (`/api/*`)
*   [**`api/login.ts`**](file:///c:/Users/gio%20joshua%20gonzales/OneDrive/Desktop/regisystem/api/login.ts): Handles credentials checks (admin config check & committee bcrypt check).
*   [**`api/events.ts`**](file:///c:/Users/gio%20joshua%20gonzales/OneDrive/Desktop/regisystem/api/events.ts): Bypasses client RLS to handle event creations, updates, and cascading student deletes securely.
*   [**`api/students.ts`**](file:///c:/Users/gio%20joshua%20gonzales/OneDrive/Desktop/regisystem/api/students.ts): Bypasses client RLS to load students joined with attendance logs and maps scanner station names.
*   [**`api/manual-add.ts`**](file:///c:/Users/gio%20joshua%20gonzales/OneDrive/Desktop/regisystem/api/manual-add.ts): Creates a student record, signed ticket token, logs email history, and sends the SMTP confirmation email.
*   [**`api/import-csv.ts`**](file:///c:/Users/gio%20joshua%20gonzales/OneDrive/Desktop/regisystem/api/import-csv.ts): Runs batch parsing and registration insertions with background SMTP dispatching.
*   [**`api/resend.ts`**](file:///c:/Users/gio%20joshua%20gonzales/OneDrive/Desktop/regisystem/api/resend.ts): Re-generates ticket QR codes and dispatches them via SMTP.
*   [**`api/email-preview.ts`**](file:///c:/Users/gio%20joshua%20gonzales/OneDrive/Desktop/regisystem/api/email-preview.ts): Retrieves stored HTML preview templates.
*   [**`api/reset-db.ts`**](file:///c:/Users/gio%20joshua%20gonzales/OneDrive/Desktop/regisystem/api/reset-db.ts): Resets database to factory demo registrants.

### 2. Frontend Client Libraries (`src/lib/*`)
*   [**`src/lib/supabase.ts`**](file:///c:/Users/gio%20joshua%20gonzales/OneDrive/Desktop/regisystem/src/lib/supabase.ts): Initializes the Supabase client using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
*   [**`src/lib/auth.ts`**](file:///c:/Users/gio%20joshua%20gonzales/OneDrive/Desktop/regisystem/src/lib/auth.ts): Formulates HTTP login/logout operations and handles direct session updates/heartbeats.
*   [**`src/lib/api.ts`**](file:///c:/Users/gio%20joshua%20gonzales/OneDrive/Desktop/regisystem/src/lib/api.ts): Wraps backend endpoint HTTP requests (passing the Bearer token in the headers for all calls).

### 3. Local Development Compatibility
*   [**`server/routes.ts`**](file:///c:/Users/gio%20joshua%20gonzales/OneDrive/Desktop/regisystem/server/routes.ts): Registered route mapping aliases for `/api/login`, `/api/events`, `/api/students`, `/api/manual-add`, `/api/import-csv`, `/api/resend`, `/api/email-preview` so that your local dev environment behaves identically to production Vercel.

### 4. Build Configuration
*   [**`vercel.json`**](file:///c:/Users/gio%20joshua%20gonzales/OneDrive/Desktop/regisystem/vercel.json): Removed the Express rewrite proxy, falling back to Vercel's native routing.
*   [**`package.json`**](file:///c:/Users/gio%20joshua%20gonzales/OneDrive/Desktop/regisystem/package.json): Installed devDependencies type declarations for `@vercel/node`.

---

## 🎯 Verification Results

*   **TypeScript Checks**: `npm run lint` passes with `0 errors`.
*   **Production Build Bundle**: `npm run build` compiles frontend assets and backend modules without warnings.
*   **Git Deployment**: All edits successfully committed and pushed to `main` branch.

---

## 💡 Important Actions Required on Vercel Dashboard
Since this is a fresh architecture, make sure to add these key environment variables on your **Vercel Settings Dashboard** to ensure the build compiles and runs:

*   `VITE_SUPABASE_URL` = (Your Supabase URL)
*   `VITE_SUPABASE_ANON_KEY` = (Your Supabase Anon Key)
*   `SUPABASE_URL` = (Your Supabase URL)
*   `SUPABASE_SERVICE_ROLE_KEY` = (Your Supabase Service Role Key)
*   `QR_SECRET` = (Your HMAC signing secret)
*   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` = (Your SMTP login credentials)
