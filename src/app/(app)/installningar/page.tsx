import { StartRedirect } from "./start-redirect";

// The start page itself is the menu in layout.tsx. Here: the right-hand column
// on a desktop before a row is chosen, and the redirect for the old anchors.
export default function SettingsStartPage() {
  return <StartRedirect />;
}
