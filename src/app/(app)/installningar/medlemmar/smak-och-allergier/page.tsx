import { redirect } from "next/navigation";
import { profilesHref } from "@/features/menu-advisor";

// The list of profiles is on Medlemmar; this address only leads there.
export default function ProfilesRedirectPage() {
  redirect(profilesHref);
}
