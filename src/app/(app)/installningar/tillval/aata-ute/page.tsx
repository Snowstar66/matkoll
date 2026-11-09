import { redirect } from "next/navigation";
import { profilesHref } from "@/features/menu-advisor";

// The old place of Smak och allergier (it was under Tillval and needed Menyrådgivare): now on Medlemmar.
export default function OldMenuProfilesPage() {
  redirect(profilesHref);
}
