import { clearedSessionCookie } from "@/app/prelaunch-auth";

export async function POST(request: Request) {
  const secure = new URL(request.url).protocol === "https:";
  return new Response(null, { status: 303, headers: { location: new URL("/", request.url).toString(), "set-cookie": clearedSessionCookie(secure) } });
}
