# Order of KP Support Center

The member support site for `support.orderofkpi.com`. Members sign in with their Member Portal
account, send a request, get a request number (`KP-COM-2026-0042`) and follow it to the end.
Staff on the routed KPI committee reply, assign, add internal notes and close requests.

Requirements are in [docs/BRD.md](docs/BRD.md) (BR numbers) and the design in
[docs/TECH_SPEC.md](docs/TECH_SPEC.md).

## How it fits together

- **Sign-in** belongs to the Member Portal. The support server calls the portal's
  `/api/support-sso/exchange`, `/password` and `/check` endpoints, signed with
  `SUPPORT_SSO_CLIENT_SECRET`. Passwords are never stored or logged here.
- **Session**: cookie `kp_support_session` (HttpOnly, SameSite=Lax, Secure on https), 12 hours at
  most, 2 hours idle. Access is checked again with the portal every 10 minutes. If the portal
  cannot be reached, sessions keep working for 30 minutes after the last good check, then stop.
- **Data**: SQLite at `${SUPPORT_DATA_DIR}/support.db` (better-sqlite3 with Drizzle), files at
  `${SUPPORT_DATA_DIR}/uploads/`. Migrations in `lib/server/db/migrations` run when the server
  starts. All data access goes through `lib/server/store.ts`, so a MySQL version can replace it.
- **Email** goes through an outbox with retries (1 m, 5 m, 30 m, 2 h, 6 h). A final failure
  emails `SUPPORT_ALERT_EMAILS`. Without `SMTP_HOST`, emails are recorded as `NOT_CONFIGURED`.
- **Health**: `GET /api/health` answers `{ok, db, uploads, outboxOldestPendingMinutes,
  portalReachable, release}`, with HTTP 503 when anything is wrong. Point the uptime monitor here.
- **Release stamp**: the footer shows `release.json` (`{"release": "2026-11-30 v.01"}`) if the
  deploy writes one, otherwise `v.00`.

## Pages

| Address | Who |
| --- | --- |
| `/` | Coming-soon page while requests are off; otherwise sign-in or New request |
| `/sign-in`, `/auth/callback` | Everyone |
| `/requests/new`, `/requests`, `/requests/<number>` | Signed-in members (staff see extra tools on the request) |
| `/staff` | Staff on a KPI committee, the Treasurer, support leads, administrators |
| `/staff/reports`, `/staff/settings` | Support leads (D&T chair) and administrators |
| `/api/staff/export` | CSV, administrators only |

The prelaunch addresses `/member-support`, `/status`, `/committee` and `/admin-login` redirect to
the new ones.

## Environment variables

Set these in Hostinger. Never commit real values. `.env.example` shows the format.

| Variable | Purpose |
| --- | --- |
| `PORTAL_URL` | The portal this copy trusts, e.g. `https://test.orderofkpi.com` |
| `SUPPORT_SSO_CLIENT_SECRET` | Shared secret registered on that portal |
| `SESSION_SECRET` | 32 or more random characters |
| `SUPPORT_URL` | This site's address. `https://support.orderofkpi.com` marks the live site, which refuses `qa.` and `test.` accounts |
| `SUPPORT_DATA_DIR` | Folder outside the web root for the database and uploads. Back it up daily |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Outgoing email (the portal's settings; from `info@kpi2012.org`) |
| `SUPPORT_ALERT_EMAILS` | Comma-separated addresses alerted about failures |
| `SUPPORT_REQUESTS_ENABLED` | `true` or `false`. Unset: off on the live site, on elsewhere |

Testing only: `SUPPORT_SSO_RECHECK_SECONDS` (default 600), `SUPPORT_SSO_GRACE_SECONDS`
(default 1800) and `SUPPORT_OUTBOX_INTERVAL_SECONDS` (default 60).

## Hostinger deployment

Node.js web app, Node 22.

- Repository: `mrjackdee/support-orderofkpi`
- Branch: `main` for the test copy (test-support.orderofkpi.com), `live` for support.orderofkpi.com
- Install command: `npm ci`
- Build command: `npm run build` (runs `next build --webpack`)
- Start command: `npm start`
- Output directory: `.next`
- Application port: `3000`

better-sqlite3 is a native module; `npm ci` installs its prebuilt binary for the server.

## Working on it

```bash
npm ci
npm run dev          # next dev
npx tsc --noEmit
npm run build
npm test             # unit tests, plus the rendered-page test when a build exists
npm run db:generate  # after changing lib/server/db/schema.ts
```

## Not in use

These belong to the earlier prelaunch build and are kept until there is a ruling on removing
them: `app/committee-auth.ts`, `app/chatgpt-auth.ts`, `app/member-identity.ts`,
`app/prelaunch-auth.ts`, `app/support-center.tsx`, `app/committee/committee-dashboard.tsx`,
`db/` and `drizzle/` (Cloudflare D1), `examples/`, and the Cloudflare Workers build (`worker/`,
`vite.config.ts`, `build/`, `npm run dev:workers`). Nothing on the Hostinger path imports them.
The Google Sheet and Apps Script connector are retired (Q8).
