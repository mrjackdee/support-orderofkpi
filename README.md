# Order of KP Support Center

Prelaunch website for `support.orderofkpi.com`.

The public home page announces the forthcoming KP Support Center and previews the member experience. The working request portal, status tracker, and D&T administration dashboard are restricted to approved administrators during prelaunch.

## Prelaunch behavior

- `/` is the public coming-soon page.
- `/admin-login` is the D&T administrator sign-in page.
- `/member-support`, `/status`, and `/committee` require an administrator session.
- Request and follow-up submission are disabled until `SUPPORT_REQUESTS_ENABLED=true`.
- API routes reject anonymous visitors even if someone tries to call them directly.
- The D&T Administration link appears only in the footer.

## Hostinger requirements

Use a Hostinger plan that supports Node.js web applications, such as Business Web Hosting or a Cloud hosting plan. Select Node.js 22 when configuring the application.

Recommended deployment settings:

- Repository: `mrjackdee/support-orderofkpi`
- Branch: `main`
- Install command: `npm ci`
- Build command: `npm run build`
- Start command: `npm start`
- Output directory: `.next`
- Application port: `3000`

## Required environment variables

Configure these values in Hostinger. Do not add real credentials to GitHub.

| Variable | Purpose |
| --- | --- |
| `PRELAUNCH_ADMIN_EMAILS` | Comma-separated D&T administrator email allowlist |
| `PRELAUNCH_ADMIN_PASSWORD` | Strong temporary prelaunch password |
| `PRELAUNCH_SESSION_SECRET` | Random secret of at least 32 characters used to sign administrator sessions |
| `SUPPORT_REQUESTS_ENABLED` | Keep `false` until the full support system is ready |

The `.env.example` file documents the expected format without containing production credentials.

## Hostinger deployment

1. In Hostinger hPanel, open **Websites** and choose **Add Website**.
2. Select **Node.js Web App**.
3. Choose **Connect with GitHub** and authorize the Hostinger GitHub application.
4. Select `mrjackdee/support-orderofkpi` and the `main` branch.
5. Confirm the install, build, and start commands listed above.
6. Add the four required prelaunch environment variables.
7. Deploy the application.
8. Add `support.orderofkpi.com` as the application domain.
9. Keep `SUPPORT_REQUESTS_ENABLED=false` during prelaunch.

## Full-launch storage note

The working portal was originally built with Cloudflare D1 and R2. Hostinger managed hosting does not provide those services. Before enabling request submission on Hostinger, migrate request data and file storage to a supported production service, then test request creation, uploads, status lookup, dashboard reporting, Google Sheets sync, and confirmation email delivery.

Do not change `SUPPORT_REQUESTS_ENABLED` to `true` until that migration and testing are complete.
