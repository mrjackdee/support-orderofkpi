// Calls to the portal's support-sso endpoints. The portal is the identity provider: it holds the
// passwords and decides who may sign in (BR-3, BR-5).
//
// Contract: POST JSON to `${PORTAL_URL}/api/support-sso/<name>` with
//   X-KP-SSO-Timestamp: Date.now() as a string
//   X-KP-SSO-Signature: lowercase hex HMAC-SHA256(secret, `${timestamp}.${exact body string}`)
// and an 8 second timeout.

import { createHmac } from "node:crypto";
import { PORTAL_TIMEOUT_MS, portalUrl, ssoSecret } from "./config";

export type Claims = {
  email: string;
  name: string;
  personId: string | null;
  roles: string[];
  isAdmin: boolean;
  isStaff: boolean;
  committees: string[];
  committeeRoles: Record<string, "chair" | "member">;
  passwordChangedAt: number | null;
  mustChangePassword: boolean;
};

export function buildSignature(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function signedHeaders(secret: string, body: string, now = Date.now()) {
  const timestamp = String(now);
  return {
    "content-type": "application/json",
    "x-kp-sso-timestamp": timestamp,
    "x-kp-sso-signature": buildSignature(secret, timestamp, body),
  };
}

/** Accept only the documented claim fields, with the documented types. */
export function normalizeClaims(raw: unknown): Claims | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) return null;
  const strings = (input: unknown) => (Array.isArray(input) ? input.filter((item): item is string => typeof item === "string") : []);
  const committeeRoles: Record<string, "chair" | "member"> = {};
  if (value.committeeRoles && typeof value.committeeRoles === "object") {
    for (const [slug, role] of Object.entries(value.committeeRoles as Record<string, unknown>)) {
      committeeRoles[slug] = role === "chair" ? "chair" : "member";
    }
  }
  const changed = Number(value.passwordChangedAt);
  return {
    email,
    name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : email,
    personId: typeof value.personId === "string" && value.personId ? value.personId : typeof value.personId === "number" ? String(value.personId) : null,
    roles: strings(value.roles),
    isAdmin: value.isAdmin === true,
    isStaff: value.isStaff === true,
    committees: strings(value.committees),
    committeeRoles,
    passwordChangedAt: Number.isFinite(changed) && changed > 0 ? changed : null,
    mustChangePassword: value.mustChangePassword === true,
  };
}

export class PortalUnavailableError extends Error {
  constructor(message = "The sign-in service did not answer") {
    super(message);
    this.name = "PortalUnavailableError";
  }
}

type PortalReply = { status: number; body: Record<string, unknown> };

/**
 * One signed call. Throws PortalUnavailableError when the portal cannot be reached, times out,
 * is not configured, or answers with a server error. The request body is never logged: for the
 * password call it holds the member's password.
 */
async function call(name: "exchange" | "password" | "check" | "settings", payload: Record<string, unknown>): Promise<PortalReply> {
  const base = portalUrl();
  const secret = ssoSecret();
  if (!base || !secret) throw new PortalUnavailableError("PORTAL_URL or SUPPORT_SSO_CLIENT_SECRET is not set");
  const body = JSON.stringify(payload);
  let response: Response;
  try {
    response = await fetch(`${base}/api/support-sso/${name}`, {
      method: "POST",
      headers: signedHeaders(secret, body),
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(PORTAL_TIMEOUT_MS),
    });
  } catch (error) {
    throw new PortalUnavailableError(error instanceof Error ? `${name}: ${error.name}` : name);
  }
  let parsed: Record<string, unknown> = {};
  try {
    const value = await response.json();
    if (value && typeof value === "object") parsed = value as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  if (response.status >= 500) throw new PortalUnavailableError(`${name}: HTTP ${response.status}`);
  if (response.status === 401 && parsed.error === "BAD_SIGNATURE") throw new PortalUnavailableError(`${name}: signature refused`);
  return { status: response.status, body: parsed };
}

export type SignInResult =
  | { ok: true; claims: Claims }
  | { ok: false; status: number; message: string; code?: string };

function refusal(reply: PortalReply, fallback: string): SignInResult {
  const message = typeof reply.body.error === "string" && reply.body.error ? reply.body.error : fallback;
  const code = typeof reply.body.code === "string" ? reply.body.code : undefined;
  return { ok: false, status: reply.status, message, code };
}

export async function exchangeCode(code: string): Promise<SignInResult> {
  const reply = await call("exchange", { code });
  if (reply.status === 200) {
    const claims = normalizeClaims(reply.body.claims);
    if (claims) return { ok: true, claims };
    throw new PortalUnavailableError("exchange: unreadable claims");
  }
  if (reply.status === 400) return { ok: false, status: 400, message: "That sign-in link has expired or was already used. Please sign in again.", code: "INVALID_CODE" };
  return refusal(reply, "This account cannot sign in to the Support Center.");
}

export async function passwordSignIn(email: string, password: string, clientIp: string): Promise<SignInResult> {
  const reply = await call("password", { email, password, clientIp });
  if (reply.status === 200) {
    const claims = normalizeClaims(reply.body.claims);
    if (claims) return { ok: true, claims };
    throw new PortalUnavailableError("password: unreadable claims");
  }
  // The portal's own message, passed to the member unchanged.
  return refusal(reply, "We could not sign you in. Please check your email address and password.");
}

export type CheckResult = Record<string, { allowed: boolean; claims: Claims | null }>;

export async function checkEmails(emails: string[]): Promise<CheckResult> {
  const unique = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))].slice(0, 100);
  const reply = await call("check", { emails: unique });
  if (reply.status !== 200 || !reply.body.results || typeof reply.body.results !== "object") {
    throw new PortalUnavailableError(`check: HTTP ${reply.status}`);
  }
  const results: CheckResult = {};
  const raw = reply.body.results as Record<string, { allowed?: unknown; claims?: unknown }>;
  for (const email of unique) {
    const entry = raw[email];
    if (!entry) {
      results[email] = { allowed: false, claims: null };
      continue;
    }
    const claims = entry.allowed === true ? normalizeClaims(entry.claims) : null;
    results[email] = { allowed: entry.allowed === true && claims !== null, claims };
  }
  return results;
}

/**
 * The Support Center settings administrators keep on the Member Portal Admin Dashboard (Jack,
 * 11/06/2026): today only who receives failure alerts. POST /api/support-sso/settings with body {},
 * signed like the other calls. Returns the raw answer for ./alert-recipients to check; throws
 * PortalUnavailableError when the portal cannot be reached or does not answer 200.
 */
export async function fetchPortalSettings(): Promise<Record<string, unknown>> {
  const reply = await call("settings", {});
  if (reply.status !== 200) {
    const code = typeof reply.body.error === "string" ? ` ${reply.body.error.slice(0, 60)}` : "";
    throw new PortalUnavailableError(`settings: HTTP ${reply.status}${code}`);
  }
  return reply.body;
}

/** For /api/health: does the portal answer a signed call at all? */
export async function portalAnswers() {
  try {
    await checkEmails([]);
    return true;
  } catch {
    return false;
  }
}
