import { createPrelaunchSession, safeReturnTo, sessionCookie, verifyPrelaunchCredentials } from "@/app/prelaunch-auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const returnTo = safeReturnTo(String(form.get("returnTo") ?? "/member-support"));
  if (!(await verifyPrelaunchCredentials(email, password))) {
    const target = new URL("/admin-login", request.url);
    target.searchParams.set("error", "1");
    target.searchParams.set("returnTo", returnTo);
    return Response.redirect(target, 303);
  }
  const secure = new URL(request.url).protocol === "https:";
  return new Response(null, { status: 303, headers: { location: returnTo, "set-cookie": sessionCookie(await createPrelaunchSession(email), secure) } });
}
