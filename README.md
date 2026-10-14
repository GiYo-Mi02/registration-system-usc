# Registration system

React/Vite registration and QR check-in frontend, Express backend for local/persistent hosting, Vercel API handlers, and Supabase persistence.

See [AUDIT.md](AUDIT.md) for the completed repairs, verification evidence, production blockers, and full hosting runbook.

## Development

Use Node 22.12+ or Node 24 within the supported package range. On Windows:

```powershell
npm.cmd ci
Copy-Item .env.example .env
# Fill the required environment values before starting.
npm.cmd run dev
```

Required server values: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `QR_SECRET`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD`. There are no automatic login or signing-secret defaults. Keep privileged values out of frontend code and `VITE_*` variables. Local development can use a hosted database, so use a dedicated development project.

SMTP requires `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`. `SMTP_SIMULATE=true` is an explicit development simulation; it does not send mail. Demo reset is off by default and never available on Vercel or in production.

## Checks and production serving

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd start
```

`npm start` sets production mode. The frontend is served from `dist/`; the backend bundle is kept separately in `build/`. Production requires configured credentials that meet the minimum checks. Changing a QR signing secret invalidates previously signed tickets; coordinate any rotation with ticket handling.

Vercel uses `npm run build:client`, `dist/`, and the separate `api/` handlers configured in `vercel.json`. Set its environment values for the intended preview/production scope and complete the release gates in the audit before production use.

Camera access on a phone over a LAN IP requires trusted HTTPS. A page opening over HTTP does not prove that the camera can run.

## Ticket design preview

Run `npm.cmd run preview:ticket`, then open [previews/cyber-ticket.html](previews/cyber-ticket.html) in a browser. It contains sample details and a dummy QR with inert text, not an admission ticket or a web link. New tickets use the navy/cyan cybersecurity design in `server/ticket-template.ts`. Administrator previews render the current design using the saved entry QR without sending an email; previously delivered emails are unchanged.

`npm run clean` removes only generated `dist/` and `build/` artifacts. The supplied SQL export is a transfer snapshot; the current migration directory alone is not yet a demonstrated fresh-database provisioning path.
