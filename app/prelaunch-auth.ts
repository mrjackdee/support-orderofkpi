import { env } from "runtime-env";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const PRELAUNCH_COOKIE = "kp_prelaunch_admin";
const SESSION_SECONDS = 8 * 60 * 60;

type PrelaunchAdmin = { email: string };

function runtimeValue(name: string) {
  const workerValue = (env as unknown as Record<string, string | undefined>)[name];
  if (workerValue) return workerValue;
  if (typeof process !== "undefined") return process.env[name];
  return undefined;
}

function adminEmails() {
  return new Set(
    (runtimeValue("PRELAUNCH_ADMIN_EMAILS") ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function textToBase64Url(value: string) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlToText(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

async function signature(payload: string) {
  const secret = runtimeValue("PRELAUNCH_SESSION_SECRET") ?? "";
  if (secret.length < 32) return "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(signed));
}

async function sameValue(left: string, right: string) {
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const [leftDigest, rightDigest] = await Promise.all([digest(left), digest(right)]);
  let different = 0;
  for (let index = 0; index < leftDigest.length; index += 1) different |= leftDigest[index] ^ rightDigest[index];
  return different === 0;
}

function cookieValue(rawCookie: string | null) {
  if (!rawCookie) return "";
  for (const part of rawCookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === PRELAUNCH_COOKIE) return value.join("=");
  }
  return "";
}

export function safeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/member-support";
  try {
    const url = new URL(value, "https://support.orderofkpi.com");
    if (url.origin !== "https://support.orderofkpi.com") return "/member-support";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/member-support";
  }
}

export function prelaunchAuthConfigured() {
  return adminEmails().size > 0 && Boolean(runtimeValue("PRELAUNCH_ADMIN_PASSWORD")) && (runtimeValue("PRELAUNCH_SESSION_SECRET")?.length ?? 0) >= 32;
}

export function supportRequestsEnabled() {
  return runtimeValue("SUPPORT_REQUESTS_ENABLED")?.trim().toLowerCase() === "true";
}

export async function verifyPrelaunchCredentials(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const configuredPassword = runtimeValue("PRELAUNCH_ADMIN_PASSWORD") ?? "";
  return prelaunchAuthConfigured() && adminEmails().has(normalizedEmail) && await sameValue(password, configuredPassword);
}

export async function createPrelaunchSession(email: string) {
  const payload = textToBase64Url(JSON.stringify({ email: email.trim().toLowerCase(), expiresAt: Date.now() + SESSION_SECONDS * 1000 }));
  return `${payload}.${await signature(payload)}`;
}

export function sessionCookie(token: string, secure = true) {
  return `${PRELAUNCH_COOKIE}=${token}; Path=/; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Max-Age=${SESSION_SECONDS}`;
}

export function clearedSessionCookie(secure = true) {
  return `${PRELAUNCH_COOKIE}=; Path=/; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Max-Age=0`;
}

export async function verifyPrelaunchSession(rawCookie: string | null): Promise<PrelaunchAdmin | null> {
  const token = cookieValue(rawCookie);
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature) return null;
  const expectedSignature = await signature(payload);
  if (!expectedSignature || !(await sameValue(suppliedSignature, expectedSignature))) return null;
  try {
    const parsed = JSON.parse(base64UrlToText(payload)) as { email?: string; expiresAt?: number };
    if (!parsed.email || !parsed.expiresAt || parsed.expiresAt <= Date.now() || !adminEmails().has(parsed.email)) return null;
    return { email: parsed.email };
  } catch {
    return null;
  }
}

export async function getPrelaunchAdmin() {
  const requestHeaders = await headers();
  return verifyPrelaunchSession(requestHeaders.get("cookie"));
}

export async function requirePrelaunchAdmin(returnTo: string) {
  const admin = await getPrelaunchAdmin();
  if (!admin) redirect(`/admin-login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`);
  return admin;
}

export async function prelaunchAdminFromRequest(request: Request) {
  return verifyPrelaunchSession(request.headers.get("cookie"));
}
