// Session helpers for server-rendered pages.

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { canGlobal, type GlobalAction } from "./permissions";
import { FLASH_COOKIE, resolveSession, SESSION_COOKIE, type SessionState } from "./session";

export async function pageSession(): Promise<SessionState> {
  const jar = await cookies();
  return resolveSession(jar.get(SESSION_COOKIE)?.value);
}

export type SignedIn = Extract<SessionState, { kind: "ok" }>;

/** The signed-in member, or a trip to the sign-in page. */
export async function requireSignedIn(returnTo: string): Promise<SignedIn> {
  const state = await pageSession();
  if (state.kind === "ok") return state;
  const params = new URLSearchParams({ next: returnTo });
  if (state.kind === "unavailable") params.set("reason", "unavailable");
  if (state.kind === "revoked") params.set("reason", "revoked");
  redirect(`/sign-in?${params.toString()}`);
}

/** Staff pages: anyone else gets the same "not found" as a page that does not exist. */
export async function requireStaff(returnTo: string, action: GlobalAction = "view_queue"): Promise<SignedIn> {
  const state = await requireSignedIn(returnTo);
  if (!canGlobal(state.actor, action)) notFound();
  return state;
}

export async function flashMessage() {
  const jar = await cookies();
  const raw = jar.get(FLASH_COOKIE)?.value;
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).slice(0, 300);
  } catch {
    return "";
  }
}

export function safeNext(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/requests/new";
  if (value.startsWith("/sign-in") || value.startsWith("/api/") || value.startsWith("/auth/")) return "/requests/new";
  return value.slice(0, 300);
}
