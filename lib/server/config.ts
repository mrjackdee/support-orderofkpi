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

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailList(name: string) {
  return env(name)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => EMAIL_PATTERN.test(item));
}

/** Where failure alerts go when neither the portal nor SUPPORT_ALERT_EMAILS names anyone (Jack, 11/06/2026). */
export const DEFAULT_ALERT_EMAIL = "cto@orderofkpi.org";

/**
 * SUPPORT_ALERT_EMAILS, which is now only the fallback: alerts go to the list administrators keep
 * on the Member Portal Admin Dashboard (./alert-recipients). Used until that list is first fetched.
 */
export function alertEmails() {
  return emailList("SUPPORT_ALERT_EMAILS");
}

/**
 * Who receives the daily digest (CEO ruling 11-05-2026: one fixed address, not committee chairs).
 * SUPPORT_DIGEST_EMAILS; else `alertFallback` (the resolved alert list); else SUPPORT_ALERT_EMAILS;
 * else cto@orderofkpi.org.
 */
export function digestEmails(alertFallback: string[] = []) {
  const list = emailList("SUPPORT_DIGEST_EMAILS");
  if (list.length) return list;
  if (alertFallback.length) return [...new Set(alertFallback.map((item) => item.toLowerCase()))];
  const env = alertEmails();
  return env.length ? env : [DEFAULT_ALERT_EMAIL];
}

/** How often the alert list is fetched again from the portal (10 minutes). Testing: SUPPORT_SETTINGS_REFRESH_SECONDS. */
export function settingsRefreshMs() {
  return positiveNumber("SUPPORT_SETTINGS_REFRESH_SECONDS", 600) * 1000;
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

/** "HH:MM" (24-hour) as minutes after midnight, or the fallback when unset or malformed. */
export function clockMinutes(raw: string, fallback: number) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : fallback;
}

/** When the nightly backup runs, US Eastern. SUPPORT_BACKUP_AT moves it, for testing only. */
export function backupAtMinutes() {
  return clockMinutes(env("SUPPORT_BACKUP_AT"), 2 * 60);
}

/** When the daily digest goes out on business days, US Eastern. SUPPORT_DIGEST_AT moves it. */
export function digestAtMinutes() {
  return clockMinutes(env("SUPPORT_DIGEST_AT"), 8 * 60);
}

export function backupsDir() {
  return path.join(dataDir(), "backups");
}

export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
export const PORTAL_TIMEOUT_MS = 8000;
export const ADMIN_CONTACT = "admin@orderofkpi.org";
