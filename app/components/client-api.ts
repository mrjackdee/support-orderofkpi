// Small helpers for pages that send changes. Every change carries the session's CSRF token.

export type ApiResult<T = Record<string, unknown>> = { ok: true; data: T } | { ok: false; error: string; status: number };

async function read<T>(response: Response): Promise<ApiResult<T>> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    const fallback = response.status === 401 ? "Please sign in again." : "Something went wrong. Please try again.";
    return { ok: false, error: data.error || fallback, status: response.status };
  }
  return { ok: true, data };
}

export async function postJson<T = Record<string, unknown>>(url: string, body: unknown, csrf: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify(body) });
    return read<T>(response);
  } catch {
    return { ok: false, error: "We could not reach the Support Center. Check your connection and try again.", status: 0 };
  }
}

export async function postForm<T = Record<string, unknown>>(url: string, form: FormData, csrf: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "x-csrf-token": csrf }, body: form });
    return read<T>(response);
  } catch {
    return { ok: false, error: "We could not reach the Support Center. Check your connection and try again.", status: 0 };
  }
}

export function newClientToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
