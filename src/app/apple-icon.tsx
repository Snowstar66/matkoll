import { appIconResponse } from "./app-icon-image";
import { motifScale } from "./app-info";

// The home screen icon on iPhone (AD-27): 180 × 180 px at /apple-icon. iOS rounds
// the corners itself. Generated at build time; the proxy lets it through without
// a session.

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return appIconResponse(size.width, motifScale.apple);
}
