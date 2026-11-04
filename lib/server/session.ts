// The Support Center's own session (TECH_SPEC 3.2).
// Cookie kp_support_session: host-only, HttpOnly, Secure on https, SameSite=Lax, an opaque random
// value. Only its HMAC-SHA256 under SESSION_SECRET is stored. 12 hours absolute, 2 hours idle.
// The portal is asked again whether the person may still sign in when the last answer is older
// than the re-check interval (10 minutes). If the portal cannot be reached, sessions keep working
// until 30 minutes after the last good answer, then fail closed.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { alertEmails, isProductionSite, portalGraceMs, recheckMs, secureCookies, SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, sessionSecret } from "./config";
import { alertEmail } from "./email";
import type { Actor } from "./permissions";
import { checkEmails, PortalUnavailableError, type Claims } from "./sso";
import {
  claimsToActor,
  createSession,
  deleteSession,
  deleteSessionsFor,
  findSession,
  getMarker,
  queueAlert,
  recordFailedCheck,
  recordGoodCheck,
  setMarker,
  touchSession,
} from "./store";

export const SESSION_COOKIE = "kp_support_session";
export const FLASH_COOKIE = "kp_support_flash";

export type SessionState =
  | { kind: "none" }
  | { kind: "revoked" }
  | { kind: "unavailable" }
  | { kind: "ok"; actor: Actor; claims: Claims; idHash: string; csrf: string };

export function hashSessionId(id: string) {
  return createHmac("sha256", sessionSecret()).update(`session:${id}`).digest("hex");
}

export function csrfTokenFor(idHash: string) {
  return createHmac("sha256", sessionSecret()).update(`csrf:${idHash}`).digest("hex");
}

export function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function readCookie(header: string | null, name: string) {
  if (!header) return "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

function cookieAttributes(maxAgeSeconds: number) {
  return `Path=/; HttpOnly; ${secureCookies() ? "Secure; " : ""}SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function sessionCookieHeader(id: string) {
  return `${SESSION_COOKIE}=${id}; ${cookieAttributes(Math.floor(SESSION_ABSOLUTE_MS / 1000))}`;
}

export function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; ${cookieAttributes(0)}`;
}

export function flashCookieHeader(message: string) {
  return `${FLASH_COOKIE}=${encodeURIComponent(message.slice(0, 300))}; ${cookieAttributes(60)}`;
}

/** BR-65: test and QA accounts never sign in to the live Support Center. */
export function isRefusedOnThisSite(email: string) {
  if (!isProductionSite()) return false;
  const normalized = email.trim().toLowerCase();
  return normalized.startsWith("qa.") || normalized.startsWith("test.") || normalized.endsWith("@test.orderofkpi.com");
}

export const MUST_CHANGE_PASSWORD_MESSAGE =
  "You need to choose a new password before you can use the Support Center. Please sign in at the Member Portal, choose a new password there, then come back and sign in.";

/** Starts a session for a member the portal has just vouched for. Returns the cookie value. */
export async function startSession(claims: Claims) {
  const id = randomBytes(32).toString("base64url");
  await createSession(hashSessionId(id), claims, Date.now() + SESSION_ABSOLUTE_MS);
  return id;
}

async function alertPortalOutage(detail: string) {
  const now = Date.now();
  const last = await getMarker("portal-outage-alert");
  if (now - last < 60 * 60 * 1000) return;
  await setMarker("portal-outage-alert", now);
  const to = alertEmails();
  if (to.length) {
    await queueAlert(to, alertEmail("The member portal sign-in check is not answering", [
      "The Support Center could not reach the member portal to confirm who may sign in.",
      `Detail: ${detail}`,
      "Members stay signed in for up to 30 minutes after the last good check, then they are asked to try again later.",
    ]));
  }
}

const RETRY_AFTER_FAILURE_MS = 60 * 1000;

export async function resolveSession(rawId: string | null | undefined): Promise<SessionState> {
  if (!rawId || rawId.length > 200) return { kind: "none" };
  const idHash = hashSessionId(rawId);
  const session = await findSession(idHash);
  if (!session) return { kind: "none" };
  const now = Date.now();
  if (now >= session.expiresAt || now - session.lastSeenAt > SESSION_IDLE_MS) {
    await deleteSession(idHash);
    return { kind: "none" };
  }
  let claims = session.parsedClaims;
  const due = now - session.checkedAt >= recheckMs();
  const recentlyFailed = session.checkFailedAt !== null && now - session.checkFailedAt < RETRY_AFTER_FAILURE_MS;
  if (due && !recentlyFailed) {
    try {
      const result = (await checkEmails([session.email]))[session.email];
      const fresh = result?.allowed ? result.claims : null;
      const passwordChangedSince = fresh?.passwordChangedAt ? fresh.passwordChangedAt > session.createdAt : false;
      if (!fresh || fresh.mustChangePassword || isRefusedOnThisSite(fresh.email)) {
        await deleteSessionsFor(session.email);
        return { kind: "revoked" };
      }
      if (passwordChangedSince) {
        await deleteSession(idHash);
        return { kind: "revoked" };
      }
      await recordGoodCheck(session.email, fresh, now);
      claims = fresh;
      session.lastGoodCheckAt = now;
    } catch (error) {
      if (!(error instanceof PortalUnavailableError)) throw error;
      await recordFailedCheck(idHash, now);
      await alertPortalOutage(error.message);
    }
  }
  if (now - session.lastGoodCheckAt > portalGraceMs()) return { kind: "unavailable" };
  if (now - session.lastSeenAt > 60 * 1000) await touchSession(idHash, now);
  return { kind: "ok", actor: claimsToActor(claims), claims, idHash, csrf: csrfTokenFor(idHash) };
}

export async function sessionFromRequest(request: Request) {
  return resolveSession(readCookie(request.headers.get("cookie"), SESSION_COOKIE));
}

export async function endSession(idHash: string) {
  await deleteSession(idHash);
}
