import { headers } from "next/headers";
import { isCommitteeEmail } from "./committee-auth";

export async function getMemberIdentity() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email") ?? "";
  const encodedName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedName)
      : encodedName ?? "";
  return { email, fullName, isCommittee: isCommitteeEmail(email) };
}
