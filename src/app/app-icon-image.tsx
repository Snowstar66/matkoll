import { ImageResponse } from "next/og";
import { appIconColors, jarColors } from "./theme-colors";

// The app icon (Story 11.7, "Burken"): a pantry jar with a check mark, on the
// accent green. The same drawing serves the manifest's icons (icon.tsx) and the
// home screen icon on iPhone (apple-icon.tsx). `rounded` is for the "any" icons;
// the others fill the square, since iPhone and Android mask them themselves.

const jarGreen = appIconColors.accent;

/** The jar on a 512 canvas, scaled to `scale` of the square around its centre. */
export function AppIconArt({ scale, rounded }: { scale: number; rounded: boolean }) {
  const offset = 256 * (1 - scale);
  return (
    <svg width="100%" height="100%" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" rx={rounded ? 112 : 0} fill={jarGreen} />
      <g transform={`translate(${offset} ${offset}) scale(${scale})`}>
        <rect x="166" y="104" width="180" height="46" rx="14" fill={jarColors.lid} />
        <rect x="182" y="146" width="148" height="22" rx="6" fill={jarColors.lidShadow} opacity=".35" />
        <path d="M150 196c0-18 14-32 32-32h148c18 0 32 14 32 32v178c0 35-28 62-62 62H212c-34 0-62-27-62-62V196z" fill={jarColors.glass} />
        <path d="M200 300l40 40 78-88" fill="none" stroke={jarGreen} strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** A square PNG of the app icon. */
export function appIconResponse(side: number, scale: number, rounded = false): ImageResponse {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <AppIconArt scale={scale} rounded={rounded} />
      </div>
    ),
    { width: side, height: side },
  );
}
