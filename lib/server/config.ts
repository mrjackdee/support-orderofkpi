// Settings read from the environment. Read on each call so a changed value needs no code change.

import path from "node:path";

export const PRODUCTION_HOST = "support.orderofkpi.com";

function env(name: string) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function positiveNumber(name: string, fallback: number) {
  const parsed = Number(env(name));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function portalUrl() {
  return env("PORTAL_URL").replace(/\/+$/, "");
}

export function ssoSecret() {
  return env("SUPPORT_SSO_CLIENT_SECRET");
}

export function sessionSecret() {
  const secret = env("SESSION_SECRET");
  if (secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return secret;
}

export function sessionSecretConfigured() {
  return env("SESSION_SECRET").length >= 32;
}

export function dataDir() {
  return path.resolve(env("SUPPORT_DATA_DIR") || path.join(process.cwd(), ".support-data"));
}

export function uploadsDir() {
  return path.join(dataDir(), "uploads");
}

/** The public address of this support site, e.g. https://support.orderofkpi.com */
export function supportUrl() {
  return (env("SUPPORT_URL") || "http://localhost:3000").replace(/\/+$/, "");
}

export function supportOrigin() {
  try {
    return new URL(supportUrl()).origin;
  } catch {
    return "http://localhost:3000";
  }
}

/** The live site is the one whose SUPPORT_URL host is support.orderofkpi.com. */
export function isProductionSite() {
  try {
    return new URL(supportUrl()).hostname.toLowerCase() === PRODUCTION_HOST;
  } catch {
    return false;
  }
}

export function secureCookies() {
  return supportUrl().startsWith("https://");
}

/**
 * SUPPORT_REQUESTS_ENABLED decides. Left unset, the live site keeps submission off and every
 * other host (the test copy) turns it on so it can be tested.
 */
export function requestsEnabled() {
  const raw = env("SUPPORT_REQUESTS_ENABLED").toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return !isProductionSite();
}

export function smtpConfig() {
  const host = env("SMTP_HOST");
  if (!host) return null;
  return {
    host,
    port: Number(env("SMTP_PORT")) || 587,
    secure: env("SMTP_SECURE").toLowerCase() === "true",
    user: env("SMTP_USER"),
    pass: process.env.SMTP_PASS ?? "",
    from: env("SMTP_FROM") || "Order of KP Member Support <info@kpi2012.org>",
  };
}

export function alertEmails() {
  return env("SUPPORT_ALERT_EMAILS")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
}

/** How old a portal access check may get before it is repeated (TECH_SPEC 3.2: 10 minutes). */
export function recheckMs() {
  return positiveNumber("SUPPORT_SSO_RECHECK_SECONDS", 600) * 1000;
}

/** How long sessions keep working while the portal cannot be reached (30 minutes). */
export function portalGraceMs() {
  return positiveNumber("SUPPORT_SSO_GRACE_SECONDS", 1800) * 1000;
}

export function outboxIntervalMs() {
  return positiveNumber("SUPPORT_OUTBOX_INTERVAL_SECONDS", 60) * 1000;
}

export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
export const PORTAL_TIMEOUT_MS = 8000;
export const ADMIN_CONTACT = "admin@orderofkpi.org";
