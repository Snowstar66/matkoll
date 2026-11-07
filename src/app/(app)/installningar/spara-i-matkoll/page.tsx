import { redirect } from "next/navigation";

// Moved: both old pages are now "Använd med telefonen".
export default function Moved() {
  redirect("/installningar/telefon");
}
