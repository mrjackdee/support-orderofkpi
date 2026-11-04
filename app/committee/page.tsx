import { permanentRedirect } from "next/navigation";

// The prelaunch D&T dashboard moved to the staff queue. committee-dashboard.tsx is no longer used.
export default function CommitteePage() {
  permanentRedirect("/staff");
}
