# Migration Walkthrough: Authenticated Vercel API + Supabase

The architecture keeps all database access behind authenticated application endpoints:
1. The **React frontend** communicates only with `/api/*` routes and never receives a Supabase service-role key.
2. Database and email actions run in standalone **Vercel native serverless functions** using the service role only on the server.

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
*   **`api/verify-scan.ts`**: Validates the committee session, event, QR HMAC, and stored token before invoking the service-role-only attendance RPC.
*   **`api/logout.ts`**: Revokes the current custom session without exposing database access to the browser.

### 2. Frontend Client Libraries (`src/lib/*`)
*   [**`src/lib/auth.ts`**](file:///c:/Users/gio%20joshua%20gonzales/OneDrive/Desktop/regisystem/src/lib/auth.ts): Formulates HTTP login/logout operations and server-validated session heartbeats.
*   [**`src/lib/api.ts`**](file:///c:/Users/gio%20joshua%20gonzales/OneDrive/Desktop/regisystem/src/lib/api.ts): Wraps backend endpoint HTTP requests (passing the Bearer token in the headers for all calls).

### 3. Local Development Compatibility
*   [**`server/routes.ts`**](file:///c:/Users/gio%20joshua%20gonzales/OneDrive/Desktop/regisystem/server/routes.ts): Registered route mapping aliases for `/api/login`, `/api/events`, `/api/students`, `/api/manual-add`, `/api/import-csv`, `/api/resend`, `/api/email-preview` so that your local dev environment behaves identically to production Vercel.
- **Added `DELETE /api/students` endpoint** in [`server/routes.ts`](file:///c:/Users/gio%2520joshua%2520gonzales/OneDrive/Desktop/regisystem/server/routes.ts): Standardizes local Express server parity with the production Vercel handler.
- **Enabled Cascade Deletion**: Updated both the `DELETE` and `POST` deletion endpoints to delete records from child tables (`email_log`, `attendance`, and `qr_tokens`) in cascade order before removing the student record, resolving foreign key constraint failures.

---

## 4. Bulk Delete Feature ("Clear Registry")

- **Backend updates**: Added support for the `all=true` query parameter inside the `DELETE /api/students` endpoint in both `api/students.ts` (production) and `server/routes.ts` (local). When activated, the server fetches all students registered for the given `eventId`, deletes their related records in cascade order (`email_log` → `attendance` → `qr_tokens`), and removes all student entries in one operation.
- **Client utility**: Added `deleteAllStudents` helper in [`src/lib/api.ts`](file:///c:/Users/gio%2520joshua%2520gonzales/OneDrive/Desktop/regisystem/src/lib/api.ts).
- **Admin UI changes**:
  - Implemented soft, borderless, floating pixelated (stair-step blocky) white clouds inside the Sky Blue header background to give a clean retro pixel "sky" feel. Removed the green pipes and bird mascot from the header area.tsx`](file:///c:/Users/gio%20joshua%20gonzales/OneDrive/Desktop/regisystem/src/components/AdminPanel.tsx).
  - Added double safety confirmations: (1) a confirmation dialog, and (2) a text validation prompt where the user must type the exact name of the event to execute the bulk deletion.

---

## 🎯 Verification Results

*   **TypeScript Checks**: `npm run lint` passes with `0 errors`.
*   **Production Build Bundle**: `npm run build` compiles frontend assets and backend modules without warnings.
*   **Git Deployment**: All edits successfully committed and pushed to `main` branch.

---

## 💡 Important Actions Required on Vercel Dashboard
Since this is a fresh architecture, make sure to add these key environment variables on your **Vercel Settings Dashboard** to ensure the build compiles and runs:

*   `SUPABASE_URL` = (Your Supabase URL)
*   `SUPABASE_SERVICE_ROLE_KEY` = (Your Supabase Service Role Key)
*   `QR_SECRET` = (Your HMAC signing secret)
*   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` = (Your SMTP login credentials)
