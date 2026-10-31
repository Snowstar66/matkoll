import { appIconColors, houseColors } from "@/app/theme-colors";

// The app icon (Story 18.20): a cream house whose door is a green check mark, on
// the accent green. One drawing for the in-app logo, the generated icons and the
// favicon. `scale` shrinks the house towards the centre (maskable icons keep it
// inside the central 80 %); `rounded` is for the "any" icons and the logo, the
// others fill the square, since iPhone and Android mask them themselves.

export function HouseIcon({
  size = "100%",
  scale = 1,
  rounded = true,
  className,
}: {
  size?: number | string;
  scale?: number;
  rounded?: boolean;
  className?: string;
}) {
  const offset = 256 * (1 - scale);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect width="512" height="512" rx={rounded ? 112 : 0} fill={appIconColors.accent} />
      <g transform={`translate(${offset} ${offset}) scale(${scale})`}>
        <path d="M256 112 L406 236 V384 c0 18-14 32-32 32 H138 c-18 0-32-14-32-32 V236 Z" fill={houseColors.cream} />
        <path d="M196 300l44 44 84-96" fill="none" stroke={appIconColors.accent} strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
