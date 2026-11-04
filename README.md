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
  portalReachable, backup, lastBackupHoursAgo, release}`, with HTTP 503 when anything is wrong,
  including no good backup in 26 hours. Point the uptime monitor here.
- **Business days** are Monday to Friday in US Eastern, except the 11 US federal holidays on the
  day they are observed (a Saturday holiday on the Friday before, a Sunday one on the Monday
  after). They are worked out for any year in `lib/server/holidays.ts`. Response targets, the
  past-target counts and the daily digest all use them.
- **Files**: up to 5 per request in all, counting the first submission, every follow-up and staff
  replies (BR-13). The server refuses a sixth with a plain message.
- **Daily digest**: at 8:00 AM Eastern on business days, each KPI committee chair (the Treasurer
  for the Treasurer's queue) gets one email listing their open requests that have nobody assigned
  or are past the response target. Requests on a KPI committee with no chair go to the support
  leads. Nobody gets an empty email. Each line shows only the request number, topic, urgency, age,
  status and a link: never the title, the description or internal notes. It goes through the
  outbox. If the server was down at 8:00 it catches up until noon, never later.
- **Release stamp**: the footer shows `release.json` (`{"release": "2026-11-30 v.01"}`) if the
  deploy writes one, otherwise `v.00`.

## Backups

The Support Center backs itself up every night at 2:00 AM Eastern, inside the running server (no
cron job to set up). If the server was down at 2:00 it backs up as soon as it is running again.
Each day is claimed in the database first, so it never runs twice.

Each backup is in `${SUPPORT_DATA_DIR}/backups/`:

- `support-YYYY-MM-DD.db`: the database, copied with SQLite's online backup while the site keeps
  working;
- `uploads-YYYY-MM-DD/`: every attached file. Files never change once saved, so a file the
  previous night already holds is hard-linked from it and only new files are copied. Each folder
  is complete on its own.

After each backup the copy is opened read-only and checked: `PRAGMA integrity_check`, a count of
requests, and that every attached file is there. The result is saved in the `backups` table. The
14 newest days are kept and older backup files deleted; nothing else is ever deleted.

If a backup fails, an alert goes to `SUPPORT_ALERT_EMAILS` (at most every 6 hours) and it tries
again every hour. If there has been no good backup for 26 hours, another alert goes out (once a
day) and `/api/health` reports degraded with `lastBackupHoursAgo`.

Copy the backups folder off the server too (for example Hostinger's own backups or a download):
a backup on the same disk does not survive the disk.

### Restore drill

Restoring never touches the live folder: it copies a backup into a new, empty folder, checks it,
and you then point the site at that folder.

```bash
# 1. See which backups there are
SUPPORT_DATA_DIR=/home/example/support-data node scripts/restore-backup.mjs --list

# 2. Restore one into a NEW folder and check it
SUPPORT_DATA_DIR=/home/example/support-data \
  node scripts/restore-backup.mjs --date 2026-11-04 --to /home/example/support-data-restored
```

It prints the `integrity_check` answer, row counts, and whether every attached file is there and
matches its SHA-256. `RESULT: PASSED` (exit code 0) means the copy is sound. It refuses to restore
into the live folder, the backups folder or a folder that is not empty.

3. To switch over: in Hostinger set `SUPPORT_DATA_DIR` to the new folder and restart. The old
   folder stays as it was, so switching back is the same step in reverse.
4. Sign in, open a recent request and one of its files, and check `/api/health`.

Run the drill before launch (BR-62) and after any change to how data is stored. The drill was
last run on 11/04/2026 with invented data: integrity `ok`, 5 requests, 5 files, none missing,
health `ok` on the restored copy.

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
(default 1800), `SUPPORT_OUTBOX_INTERVAL_SECONDS` (default 60), and `SUPPORT_BACKUP_AT` (default
`02:00`) and `SUPPORT_DIGEST_AT` (default `08:00`), each a 24-hour Eastern time, which move the
nightly backup and the daily digest. Leave them unset on the real sites.

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
npm test             # unit tests, the data-layer tests on a throw-away folder, and the
                     # rendered-page test when a build exists
npm run db:generate  # after changing lib/server/db/schema.ts
```

## Not in use

These belong to the earlier prelaunch build and are kept until there is a ruling on removing
them: `app/committee-auth.ts`, `app/chatgpt-auth.ts`, `app/member-identity.ts`,
`app/prelaunch-auth.ts`, `app/support-center.tsx`, `app/committee/committee-dashboard.tsx`,
`db/` and `drizzle/` (Cloudflare D1), `examples/`, and the Cloudflare Workers build (`worker/`,
`vite.config.ts`, `build/`, `npm run dev:workers`). Nothing on the Hostinger path imports them.
The Google Sheet and Apps Script connector are retired (Q8).
