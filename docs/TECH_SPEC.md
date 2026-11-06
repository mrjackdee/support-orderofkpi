# KP Support Center: Tech Spec

| | |
| --- | --- |
| Status | Draft for review |
| Version | 0.1, 11/04/2026 |
| Prepared by | Cheryl, CTO [Claude] |
| Implements | [BRD](BRD.md) (BR-n numbers) |
| Repositories | `mrjackdee/support-orderofkpi` (support), `mrjackdee/OrderofKPI.com` (portal) |

Basis: a full read of the support repository at `98a392a` and of the portal's sign-in, session,
role and request code at `5d95030`.

Limitation: this environment's network policy blocks orderofkpi.com, test.orderofkpi.com and
support.orderofkpi.com. Nothing here was checked against the live sites yet. Phase 0 does that.

---

## 1. Current state (verified in code)

### 1.1 Support proof of concept

| Area | Finding | Consequence |
| --- | --- | --- |
| Framework | Next.js 16 / React 19, dual build: vinext for Cloudflare Workers, `next build` standalone for Hostinger (`scripts/build-verified.sh`) | Keep Next.js on Hostinger Node; drop the Workers path |
| Storage | Drizzle on Cloudflare D1 (`db/index.ts`); uploads to R2 `env.BUCKET` (`app/api/requests/route.ts:105`) | Neither exists on Hostinger, so every data route returns 500 there. Replace both |
| Auth | One shared admin password plus an email allowlist; HMAC cookie `kp_prelaunch_admin`, 8 h (`app/prelaunch-auth.ts`) | Replace with portal sign-in. Keep the signed-cookie code pattern |
| Dead auth | `committee-auth.ts`, `chatgpt-auth.ts`, `member-identity.ts` trust `oai-authenticated-user-*` headers; nothing imports them | A spoofable header login if ever re-imported. Remove, with your ruling |
| Member identity | None: name and email are typed into the form; status lookup works by number or email | BR-11, BR-20 and BR-21 are not met. Anyone could read any request |
| Request numbers | `KP-CAT-YYYY-` plus 4 *random* digits (`route.ts:26`) | Guessable and collision-prone. Make them sequential |
| Statuses | RECEIVED, REVIEW, WORKING, COMPLETED; the member view maps them by substring | Replace with an explicit enum |
| Staff | One `leadContact` free-text field and one `committeeNotes` field; no assignment, routing, internal notes or roles | Rebuild the staff side |
| Integrations | Google Apps Script web app: Sheet row and receipt email, synchronous, no auth, no retry, creation only (`public/google-apps-script-connector.txt`) | Replace email with SMTP; the Sheet is retired (Q8) and the Apps Script link switched off |
| Validation | Category, priority, email and file type (browser-reported MIME) only; length limits in the browser only | Server-side limits plus file-content checks |
| Security | No CSRF token, no rate limits, no revocation | Section 6 |
| Tests | One rendered-HTML test against the Workers build only | New test suite (section 10) |
| Design | `app/globals.css`, hand-written tokens (section 8) | Keep as is |

### 1.2 Portal facts the integration depends on

- **Sign-in.** `POST /api/auth/login` (`server.ts:4623`):
  - scrypt hashes, constant-time compare;
  - in-memory rate limit of 10 failures per email and 50 per IP per 15 minutes;
  - `@orderofkpi.org` addresses only (`signInIdentityAllowed`, `server.ts:1227`);
  - access decided by `portalSignInAccess` (`server.ts:1256`), checked at sign-in and on every API
    call.
- **Sessions.** HMAC token `{email, mustChangePassword, exp}`, 12 h, signed with `SESSION_SECRET`.
  It is sent as `Authorization: Bearer` from `sessionStorage`. There are no cookies and no CORS.
  `passwordChangedAt` revokes older tokens.
- **No shared session.** Nothing lets another subdomain share the session or call the portal from
  a browser.
- **No identity endpoint.** There is no `/api/me`, introspection or OIDC. New routes must be
  classified in `apiAccessLevel` or they return `403 NOT_CLASSIFIED`.
- **Roles.** Role names live in `src/lib/accessRules.ts`. Committee membership lives in
  `users.committees` / `users.committee_roles`. The `digital_technology` slug is the D&T Committee.
- **Patterns to reuse.** `marketingRequests.ts` is the house pattern for:
  - per-year counters;
  - separate messages / notes / files / history;
  - 404 for someone else's request;
  - duplicate-submit tokens;
  - `ALLOWED_FILES` byte checks;
  - `renderPortalEmail`.
- **Security headers.** HSTS with `includeSubDomains`; `X-Frame-Options: DENY`. The support site
  must be HTTPS-only and cannot frame the portal.
- **Existing link.** `src/constants/support.ts` (`isLive: false`) and
  `src/components/SupportCenterPreview.tsx`, rendered at `src/pages/MemberPortal.tsx:741`.

## 2. Target architecture

```
 Member browser
   │  (1) signed in on orderofkpi.com, clicks "Member Support Center"
   ▼
 orderofkpi.com  (portal, Hostinger Node, Express)            identity authority
   │  POST /api/support-sso/handoff  (Bearer)  → one-time code (60 s)
   │  browser is sent to support.orderofkpi.com/auth/callback?code=…
   ▼
 support.orderofkpi.com  (Next.js, Hostinger Node)
   │  (2) server-to-server: POST orderofkpi.com/api/support-sso/exchange  (client secret)
   │      ← identity claims; support sets its own HttpOnly session cookie
   │  (3) every ≤ 10 min: POST /api/support-sso/check  ← still allowed? roles changed?
   ▼
 Support database (MySQL on the same Hostinger server)  +  private file store  +  SMTP
```

Principles:

- The portal stays the **only** place that holds passwords and decides access (BR-3, BR-5).
- The support app holds request data only, keyed by the portal's stable `person_id`.
- Changes to the portal are **additive**: three new endpoints, a client-secret setting, and a link
  change.

## 3. Sign-in design

### 3.1 New portal endpoints (all additive, all classified in `apiAccessLevel`)

| Endpoint | Caller | Auth | Purpose |
| --- | --- | --- | --- |
| `POST /api/support-sso/handoff` | Portal page (browser) | Member Bearer token | Issues a random 256-bit one-time code, valid 60 s and usable once, bound to the member and to `redirect_uri`. Returns the support callback URL |
| `POST /api/support-sso/exchange` | Support server | `SUPPORT_SSO_CLIENT_SECRET` (HMAC-signed request, timestamp within 60 s) | Swaps the code for claims. Re-runs `portalSignInAccess` before answering |
| `POST /api/support-sso/password` | Support server | Client secret, plus the member's IP forwarded in a signed header | Direct sign-in (BR-2). Runs the **same** code path as `/api/auth/login`, including rate limits keyed on the member's real IP. Returns claims, never a portal token |
| `POST /api/support-sso/check` | Support server | Client secret | Takes up to 100 `person_id`s; returns current access, roles and committees, and `passwordChangedAt` |

Claims returned:

- `person_id`, `email`, `name`;
- `roles[]`, `isAdmin`;
- `committees[]`, `committeeRoles{}`;
- `passwordChangedAt`, `mustChangePassword`.

Membership number is included only if Jack wants it shown to staff. Personal email and phone are
never sent.

Codes are stored only as HMAC hashes, in `DATA_DIR/support_sso.json`, following the
`password_security.json` rules. Every issue, exchange and refusal goes to `logEvent`.

If `mustChangePassword` is set, the support app refuses the session and sends the member to the
portal to choose a new password.

### 3.2 Support app session

- Cookie `kp_support_session`:
  - host-only on `support.orderofkpi.com`, so it is never shared with the portal;
  - HttpOnly, Secure, SameSite=Lax;
  - an opaque 256-bit id;
  - 12 h absolute lifetime, 2 h idle timeout.
- A `sessions` table on the server holds the id hash, `person_id`, the claims snapshot, and
  `checked_at`. Sign-out deletes the row (BR-6).
- Access re-check: if `checked_at` is more than 10 minutes old, the next request calls
  `/api/support-sso/check`. A refusal ends the session (BR-3, within 15 minutes).
- If the portal cannot be reached:
  - existing sessions keep working for up to 30 minutes;
  - after that they fail closed with a plain "sign-in service unavailable" message;
  - an alert fires (BR-61).
- CSRF protection: SameSite=Lax plus an `Origin` header check on every state-changing request, and
  a per-session CSRF token on forms.

### 3.3 Direct sign-in page (BR-2, BR-5)

`/sign-in` on support.orderofkpi.com:

- Styled in the support look (section 8), with the fields "KPI email address" and "Password".
- The form posts to the support server, which calls `/api/support-sso/password`. The password is
  held in memory for that single call only. It is never logged, stored or echoed, and
  request-logging middleware excludes that route's body.
- Error messages are the portal's own (invalid email or password, use your `@orderofkpi.org`
  address, access restricted, too many attempts), passed through unchanged.
- "Forgot password?" links to `https://orderofkpi.com/reset-password`.

**Alternative, not chosen (Q2 picked the form above):** replace the form with "Sign in with your KP Member Portal account". It
redirects to orderofkpi.com/login, which then completes the hand-off in 3.1. The support site never
touches a password, but this needs a `return_to` allow-list on the portal login page. Either option
uses the same endpoints.

### 3.4 Portal link (BR-1)

- `src/constants/support.ts`:
  - `isLive: true`;
  - `url` set to the hand-off path;
  - button label changed from "PREVIEW SUPPORT CENTER" to "Open Support Center" (own-case rule).
- `SupportCenterPreview`: the button calls `/api/support-sso/handoff`, then navigates. If that
  fails, the member gets the plain support.orderofkpi.com URL, where they can sign in directly.
- Add a "Member Support Center" Quick Link next to "Common Questions"
  (`src/pages/MemberPortal.tsx:99-111`). Visibility goes through `PAGE_ACCESS` in `accessRules.ts`,
  not page code.
- The layout change to the collapsed card needs Jack's ruling (Q11).

## 4. Data model (MySQL via Drizzle `mysql-core`)

The schema below is a rewrite of `db/schema.ts`. Every table has `created_at` / `updated_at` as
`DATETIME(3)` UTC (this fixes the proof of concept's mixed timestamp formats).

| Table | Key columns |
| --- | --- |
| `requests` | `id` PK; `request_number` UNIQUE; `topic_code`; `requester_person_id` (indexed); `requester_name`; `requester_email` (snapshot); `urgency` ENUM; `subject` VARCHAR(140); `description` TEXT (≤ 2500); `status` ENUM; `routed_committee`; `assignee_person_id` NULL; `first_response_at`; `completed_at`; `reopen_until`; `client_token` UNIQUE (duplicate guard, BR-16) |
| `request_counters` | `(topic_code, year)` PK, `next_value`. Incremented inside the insert transaction, never reused (BR-17) |
| `messages` | `request_id` FK; `author_person_id`; `author_role` (member/staff); `body`; member-visible |
| `internal_notes` | `request_id` FK; `author_person_id`; `body`. Staff only, never serialized for members (BR-34) |
| `files` (JPG, PNG, WebP, PDF, DOCX, XLSX, Q7) | `request_id` FK; `message_id` NULL; `storage_key` (random 32 hex); `original_name`; `mime` (sniffed); `bytes`; `sha256`; `uploaded_by` |
| `history` | `request_id` FK; `action`; `from` / `to` JSON; `actor_person_id`; append-only (BR-36) |
| `topics` | `code` PK; `label`; `default_committee`; `enabled`; `sort` (BR-10) |
| `settings` | Response target hours, support-lead person ids, extra notification addresses |
| `sessions` | Section 3.2 |
| `outbox` | `kind` (email / sheet); `payload` JSON; `attempts`; `next_attempt_at`; `last_error`; `status`. Feeds the retry worker (BR-43, BR-61) |
| `deflections` | `topic_code`; `tip_id`; date. No personal data (BR-14, BR-50) |

**Why MySQL.**

- Hostinger provides it on the same server (`127.0.0.1:3306`) with hPanel backups.
- It handles concurrent staff writes.
- Drizzle already supports it, so the schema ports directly.

SQLite in a persistent `DATA_DIR`, matching the portal, is the fallback if Jack prefers one pattern.
The code would change little.

**Files.** Files are kept on the server's disk at `SUPPORT_DATA_DIR/uploads/<storage_key>`, outside
the web root, and backed up with the database. They are served only by `GET /api/files/:id` after
the request's own permission check (BR-37). Magic-byte check uses the portal's `ALLOWED_FILES`
list (copied, with a test that keeps the two lists matching). Limits are 10 MB per file and
5 files per request. Files are written only after the database transaction commits; orphaned files
are swept nightly.

## 5. Application design (support repository)

### 5.1 Routes

| Route | Who | Notes |
| --- | --- | --- |
| `/` | Public | Coming-soon page until `SUPPORT_REQUESTS_ENABLED`; afterwards sign-in or New Request (BR-7) |
| `/sign-in`, `/auth/callback`, `POST /api/auth/sign-out` | Public / session | Section 3 |
| `/requests/new` | Member | The proof-of-concept form, with identity pre-filled and locked |
| `/requests` | Member | My requests |
| `/requests/[number]` | Owner or staff | Member view; same URL, staff panels added for staff |
| `/staff` | Staff | Queue (BR-30) |
| `/staff/reports` | Support lead / admin | Dashboard and CSV (BR-50, BR-51) |
| `/staff/settings` | Support lead / admin | Topics, routing, response target, notification list |
| `/api/health` | Public | DB, file store, outbox age, portal reachability; for uptime monitoring |

`/member-support`, `/status`, `/committee` and `/admin-login` redirect to the new routes. Their
prelaunch code is retired after launch, with Jack's ruling (no deletion without one).

### 5.2 Authorization

- **One server-side function** decides every permission: `can(actor, action, request)`. It covers:
  - members: own requests only;
  - committee staff: requests whose `routed_committee` is in their `committees`;
  - chairs: may also assign and reroute;
  - support lead / admin: all.
- Member responses are built without internal notes and internal history, so private material never
  leaves the server (the portal's marketing-request rule).
- Someone else's request returns 404.
- Rate limits:
  - 10 new requests per member per day;
  - 60 writes per member per hour;
  - sign-in attempts limited by the portal.

### 5.3 Notifications and the outbox

- All email and Sheet sync goes through `outbox`. A worker runs every minute inside the Node
  process, with backoff of 1 m, 5 m, 30 m, 2 h and 6 h.
- Email:
  - nodemailer with the portal's SMTP settings (`SMTP_*`), sent from `info@kpi2012.org` with
    `replyTo` set to the support address;
  - HTML and plain text, in a template ported from `renderPortalEmail`;
  - one message per recipient.
- Sheet sync: none. The Sheet is retired at launch (Q8), so `GOOGLE_APPS_SCRIPT_*` variables are
  not used.
- **Failure signal.** After the final attempt fails, or if the oldest pending item is more than 30
  minutes old:
  - an alert email goes to `SUPPORT_ALERT_EMAILS`;
  - `/api/health` reports degraded, so the uptime monitor pages a person.

### 5.4 Response clock

- `first_response_at` is set on the first staff message.
- The clock pauses while the status is Waiting on You.
- The "past target" count uses `settings.response_target_hours`, in business or calendar hours
  per Q10.
- A daily 8:00 AM Eastern digest goes to `SUPPORT_DIGEST_EMAILS` only (cto@orderofkpi.org on the
  real sites; Jack, 11/06/2026), listing requests with no owner or past target. Committee chairs
  do not receive it.
- Business days are Monday to Friday in US Eastern, less the 11 US federal holidays on their
  observed dates (Saturday to the Friday before, Sunday to the Monday after), computed for any
  year (`lib/server/holidays.ts`). The response clock, the past-target count and the digest use
  them.

## 6. Security

| Threat | Control |
| --- | --- |
| Reading another member's request | Session identity only; ownership check; 404; no email lookup |
| Guessing request numbers | Harmless: every number is permission-checked |
| Password exposure on support | No storage; memory only for one call; excluded from logs; HTTPS with HSTS |
| Code interception or replay | 60 s single use, bound to `redirect_uri`, exchanged server-to-server with a secret |
| Client secret leak | Hostinger environment variable only; rotated on staff change; portal checks timestamp and HMAC |
| CSRF | SameSite=Lax, Origin check, form token |
| Malicious upload | Byte check, size limits, served with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff` |
| XSS in messages | React escaping, no HTML rendering of member text, CSP `default-src 'self'` |
| Spoofed identity headers | The `oai-authenticated-*` files are removed (with ruling) and a lint rule bans those header names |
| Test accounts on live | Portal refuses them; support also refuses `qa.*` / `test.*` when `IS_PRODUCTION_SITE` |

## 7. Environments and deployment

| | Test | Live |
| --- | --- | --- |
| Support branch | `main` | `live` (new) |
| Support host | `test-support.orderofkpi.com` (Q12) | `support.orderofkpi.com` |
| Portal it trusts | test.orderofkpi.com | orderofkpi.com |
| Database | Its own MySQL database | Its own MySQL database |

- Each support copy has its own `SUPPORT_SSO_CLIENT_SECRET`, registered on its matching portal. A
  test session can never sign in to live.
- A GitHub Actions workflow mirrors the portal's `deploy.yml`:
  - build;
  - Hostinger deploy;
  - wait for the served `/api/health` to report the new release stamp;
  - only then tag `release/<branch>/<date>.<NN>`.
- A failed deploy alerts and consumes no number (BR-64).
- Rollback: point `live` at the last good tag. Database migrations are additive only, so the
  previous build still runs.
- Environment variables:
  - `DATABASE_URL`, `SUPPORT_DATA_DIR`;
  - `PORTAL_URL`, `SUPPORT_SSO_CLIENT_SECRET`, `SESSION_SECRET`;
  - `SMTP_*`;
  - `SUPPORT_ALERT_EMAILS`;
  - `GOOGLE_APPS_SCRIPT_URL`, `GOOGLE_APPS_SCRIPT_SECRET` (optional);
  - `SUPPORT_REQUESTS_ENABLED`;
  - `IS_PRODUCTION_SITE` (derived from the host).
- Monitoring:
  - an external uptime check on `/api/health` for both copies, every 5 minutes;
  - alerts go by email to `SUPPORT_ALERT_EMAILS`;
  - nightly backup job with a success and failure email;
  - a restore drill before launch (BR-62).

## 8. Look and feel (BR-55)

`app/globals.css` and the proof-of-concept components are kept, including:

- the tokens:
  - `--green #174b2a`, `--green-deep #10371e`;
  - `--gold #c49324`, `--gold-deep #966d12`, `--gold-soft #fbf4df`;
  - `--canvas #f4f6f2`, `--ink #17221a`, `--muted #69766e`;
- the 38 px "KP" tile, the pill tabs, the green rail, the topic cards, the stepper, the progress
  trail and the metric cards.

Planned changes:

- The footer reads "© Order of KP, Inc." (BR-56).
- Inter is either loaded properly or dropped from the font stack. Today the stack names Inter but
  never loads it.
- Eyebrow capitals follow Q9.
- Contrast check on gold text on cream: `--gold-deep #966d12` on `#fbf4df` must measure at least
  4.5:1. The portal hit this same problem with salmon.
- New screens (sign-in, my requests, conversation, staff queue) reuse the same classes. No second
  design system.

## 9. Delivery plan

| Phase | Content | Exit check |
| --- | --- | --- |
| 0. Verify | Confirm the served state of all three hosts; confirm the Hostinger plan supports a second Node app and MySQL; agree answers to section 10 of the BRD | Evidence recorded |
| 1. Foundation | MySQL schema and migrations, file store, outbox, health endpoint, test site, deploy workflow with release stamp, alerts | Test site serves the coming-soon page and health is green |
| 2. Sign-in | Portal SSO endpoints (on portal `main` only), support session, `/sign-in`, `/auth/callback`, sign-out, access re-check | Test-portal member reaches test-support both ways; lapsed member refused; password change ends the support session |
| 3. Member flow | New request, my requests, conversation, attachments, emails | QA at 375 px and desktop |
| 4. Staff | Queue, routing, assignment, notes, history, reports, settings, digest | Role matrix tested with QA accounts |
| 5. Hardening | Security review, accessibility pass, load check, backup restore drill, regression of the portal | Sign-off reports attached |
| 6. Launch | Jack promotes the portal and support to `live`; turn on `SUPPORT_REQUESTS_ENABLED`; portal link goes live | Verified at support.orderofkpi.com and orderofkpi.com, signed in as a real member account Jack names |

The portal's own rules apply to all portal work: QA, QC and regression agents before each push,
`git sync`, and the AI Studio sync check afterwards.

### Schedule to the 12/01/2026 launch (Q13)

| Dates | Work | Depends on |
| --- | --- | --- |
| 11/05 to 11/06 | Phase 0: verify the three hosts; create test-support.orderofkpi.com and its MySQL database on Hostinger | Q12 setup ruling (who creates DNS and the site) |
| 11/06 to 11/12 | Phases 1 and 2: foundation, deploy workflow, alerts; portal sign-in endpoints on portal `main` (test.orderofkpi.com) | - |
| 11/12 to 11/17 | Phases 3 and 4: member flow, staff workspace, reports | - |
| 11/17 to 11/18 | Phase 5: security, accessibility and regression checks; feature freeze 11/18 | - |
| 11/18 to 11/25 | Formal UAT by the D&T team on test-support; fixes as found | D&T testers named and available (Thanksgiving is 11/26) |
| 11/25 | Go or no-go with Jack | UAT sign-off |
| 11/30 | Jack promotes the portal endpoints and the support site to `live` | Jack |
| 12/01 | Requests switched on; portal link live; verified at both public addresses | - |

The portal's sign-in endpoints must be live on orderofkpi.com before 12/01, so the portal promotion
is on the critical path as well as the support site.

## 10. Test plan (summary)

- **Unit:**
  - permission function, for every role and action pair;
  - request counter under concurrency;
  - file byte checks;
  - outbox backoff.
- **Integration**, against a local portal and local MySQL:
  - hand-off, exchange, check;
  - password sign-in pass-through of every portal error code;
  - revocation within 10 minutes.
- **End-to-end** (Playwright, at 375 px and 1280 px):
  - the member journey in BRD section 7;
  - the staff journey;
  - 404 on another member's request;
  - double-submit;
  - no sideways scrolling.
- **Regression:** the portal's full suite on the test site before any promotion.
- **Monitoring proof:** deliberately break SMTP on test and confirm the alert email arrives;
  likewise for a stopped app and the uptime alert.
