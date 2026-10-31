import { HouseIcon } from "./house-icon";

// The app icon (Story 18.20, a house with a check mark) as a small inline logo
// beside the app's name. Decorative: the name next to it carries the meaning.

export function AppLogo({ size = 28 }: { size?: number }) {
  return <HouseIcon size={size} className="shrink-0" />;
}
