import { ImageResponse } from "next/og";
import { appIconColors } from "./theme-colors";

// The app icon (DESIGN.md, `app-icon`, AD-27): a carrot in accent and sand on
// light mode's bg, no text and no emoji. The same drawing serves the manifest's
// icons (icon.tsx) and the home screen icon on iPhone (apple-icon.tsx). The
// background fills the square; iPhone and Android round the corners themselves.

/** The drawing on a 100 × 100 canvas, centred, scaled to `scale` of the square. */
export function AppIconArt({ scale }: { scale: number }) {
  const { bg, accent, sand, sandInk } = appIconColors;
  const offset = 50 * (1 - scale);
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill={bg} />
      <g transform={`translate(${offset} ${offset}) scale(${scale})`}>
        <circle cx="50" cy="50" r="50" fill={sand} />
        <g transform="rotate(35 50 50)">
          {/* The leaves: three in accent, fanned out from the top of the carrot. */}
          <path d="M50 30 C44 22 43 12 47 5 C53 12 54 22 50 30 Z" fill={accent} />
          <path d="M50 30 C40 26 34 18 33 10 C42 12 48 20 50 30 Z" fill={accent} />
          <path d="M50 30 C60 26 66 18 67 10 C58 12 52 20 50 30 Z" fill={accent} />
          {/* The carrot, wide at the top and tapering to a point. */}
          <path d="M37 36 Q37 29 44 29 L56 29 Q63 29 63 36 L53 88 Q50 94 47 88 Z" fill={sandInk} />
          {/* Ridges across the carrot, in sand. */}
          <g stroke={sand} strokeWidth="3" strokeLinecap="round">
            <line x1="42" y1="43" x2="50" y2="43" />
            <line x1="51" y1="57" x2="58" y2="57" />
            <line x1="45" y1="71" x2="51" y2="71" />
          </g>
        </g>
      </g>
    </svg>
  );
}

/** A square PNG of the app icon. */
export function appIconResponse(side: number, scale: number): ImageResponse {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <AppIconArt scale={scale} />
      </div>
    ),
    { width: side, height: side },
  );
}
