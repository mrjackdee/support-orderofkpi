import { permanentRedirect } from "next/navigation";

// The shared prelaunch administrator password is retired. Everyone signs in with their own
// Member Portal account at /sign-in.
export default function AdminLoginPage() {
  permanentRedirect("/sign-in");
}
