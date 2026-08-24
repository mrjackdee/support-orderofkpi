import { env } from "cloudflare:workers";
import { headers } from "next/headers";

function committeeEmails() {
  const raw = (env as unknown as { COMMITTEE_ADMIN_EMAILS?: string })
    .COMMITTEE_ADMIN_EMAILS;
  return new Set(
    (raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isCommitteeEmail(email: string | null | undefined) {
  if (!email) return false;
  return committeeEmails().has(email.trim().toLowerCase());
}

export function committeeEmailFromRequest(request: Request) {
  return request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() ?? "";
}

export async function getCommitteeIdentity() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email")?.trim().toLowerCase() ?? "";
  return { email, allowed: isCommitteeEmail(email) };
}
