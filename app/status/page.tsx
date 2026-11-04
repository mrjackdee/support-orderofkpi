import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The prelaunch status page moved to /requests. A number in ?id= opens that request.
export default async function StatusPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const params = await searchParams;
  const id = (params.id ?? "").trim().toUpperCase();
  permanentRedirect(/^KP-[A-Z]{2,5}-\d{4}-\d{4,}$/.test(id) ? `/requests/${encodeURIComponent(id)}` : "/requests");
}
