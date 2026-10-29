import { appIconColors, jarColors } from "@/app/theme-colors";

// The app icon's jar (Story 11.7) as a small inline logo beside the name "Matkoll".
// Decorative: the name next to it carries the meaning.

export function AppLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" focusable="false" className="shrink-0">
      <rect width="512" height="512" rx="112" fill={appIconColors.accent} />
      <rect x="166" y="104" width="180" height="46" rx="14" fill={jarColors.lid} />
      <path d="M150 196c0-18 14-32 32-32h148c18 0 32 14 32 32v178c0 35-28 62-62 62H212c-34 0-62-27-62-62V196z" fill={jarColors.glass} />
      <path d="M200 300l40 40 78-88" fill="none" stroke={appIconColors.accent} strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
