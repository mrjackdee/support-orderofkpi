import { permanentRedirect } from "next/navigation";

// The prelaunch request page moved to /requests/new.
export default function MemberSupportPage() {
  permanentRedirect("/requests/new");
}
