import { ImageResponse } from "next/og";
import { HouseIcon } from "@/components/house-icon";

// The app icon (Story 18.20): a cream house whose door is a check mark, on the
// accent green. The same drawing serves the manifest's icons (icon.tsx) and the
// home screen icon on iPhone (apple-icon.tsx). `rounded` is for the "any" icons;
// the others fill the square, since iPhone and Android mask them themselves.

/** A square PNG of the app icon. */
export function appIconResponse(side: number, scale: number, rounded = false): ImageResponse {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <HouseIcon scale={scale} rounded={rounded} />
      </div>
    ),
    { width: side, height: side },
  );
}
