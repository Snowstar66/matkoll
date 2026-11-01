import type { ReactNode } from "react";

// Matkoll's own line icons (no icon library). They are decoration: the button or
// link around them carries the name, so every icon is aria-hidden.

export type IconProps = {
  /** Width and height in px. */
  size?: number;
  className?: string;
  /** A soft fill (16 %) in the icon's colour: the chosen tab (premium look). */
  tinted?: boolean;
};

type BaseProps = IconProps & {
  children: ReactNode;
  strokeWidth?: number;
  filled?: boolean;
};

function Icon({ size = 24, className, children, strokeWidth = 1.8, filled = false, tinted = false }: BaseProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled || tinted ? "currentColor" : "none"}
      fillOpacity={tinted && !filled ? 0.16 : undefined}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export function RecipesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
      <path d="M5 17a3 3 0 0 1 3-3h11" />
    </Icon>
  );
}

export function MealPlanIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </Icon>
  );
}

/** A shopping cart: the Inköpslista tab (Epic 11). */
export function CartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 4h2.5l2.2 11h10.6L20.5 7H6.4" />
      <circle cx="9.5" cy="19.5" r="1.5" />
      <circle cx="17" cy="19.5" r="1.5" />
    </Icon>
  );
}

/** A carrot: the Matvaror tab. */
export function CarrotIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M11.5 7.5l5 5-11.4 6.9a.9.9 0 0 1-1.2-1.2z" />
      <path d="M14 10l-1.2-5.5M14 10l5.5-1.2M14 10l3.4-3.9" />
    </Icon>
  );
}

/** A storage box with a lid: the Förråd tab. */
export function BoxIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="5" rx="1.5" />
      <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2.5" />
      <path
        strokeWidth={2.6}
        d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.28 5.28l2.12 2.12M16.6 16.6l2.12 2.12M5.28 18.72l2.12-2.12M16.6 7.4l2.12-2.12"
      />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.2} {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.2} {...props}>
      <path d="M5 12h14" />
    </Icon>
  );
}

/** Three dots in a row: a menu with more choices (⋯). */
export function MoreIcon(props: IconProps) {
  return (
    <Icon filled strokeWidth={0} {...props}>
      <circle cx="5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="19" cy="12" r="1.9" />
    </Icon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.2} {...props}>
      <path d="M15 5l-7 7 7 7" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </Icon>
  );
}

export function HeartIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <Icon filled={filled} {...props}>
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.6} {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Icon>
  );
}

/** An open ring: something is missing (beside CheckIcon, so status never rests on colour alone). */
export function RingIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.2} {...props}>
      <circle cx="12" cy="12" r="7" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.2} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5h.01" />
    </Icon>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </Icon>
  );
}

export function FridgeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6" y="3" width="12" height="18" rx="2.5" />
      <path d="M6 10h12M9 6v2M9 13v3" />
    </Icon>
  );
}

export function FreezerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
      <path d="M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5" />
    </Icon>
  );
}

export function PantryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 3h8v3H8z" />
      <path d="M7 6h10a1 1 0 0 1 1 1v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7a1 1 0 0 1 1-1z" />
      <path d="M6 11h12" />
    </Icon>
  );
}

/** A waste bin: the grey Soptunna that removes an item at once (Epic 11). */
export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V4.5h6V7" />
      <path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />
      <path d="M10 11v6M14 11v6" />
    </Icon>
  );
}

/** A map pin: marks the boende in the side menu and under the page title (Story 16.14). */
export function PinIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </Icon>
  );
}

/** A chevron pointing down: the button opens something below or above it. */
export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 9l6 6 6-6" />
    </Icon>
  );
}

/** A chevron pointing right: a row that goes somewhere (premium look). */
export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M9.5 5.5l6.5 6.5-6.5 6.5" />
    </Icon>
  );
}

/** A price tag: Erbjudanden in Inköpslista's header. */
export function TagIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.4 6.4a1.5 1.5 0 0 1-2.1 0z" />
      <circle cx="8" cy="8" r="1.5" />
    </Icon>
  );
}

/** Two arrows, up and down: the sort button (Story 19.3). */
export function SortIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 19V5M4.5 8.5L8 5l3.5 3.5M16 5v14M12.5 15.5L16 19l3.5-3.5" />
    </Icon>
  );
}

/** A circle with a question mark: Hjälp och tips. */
export function HelpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path strokeWidth={2} d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.7.3-1.2.9-1.2 1.7v.4M12 17h.01" />
    </Icon>
  );
}

/** Four tiles: the card view (Story 19.3). */
export function GridIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" />
    </Icon>
  );
}

/** A door with an arrow out: Logga ut. */
export function LogoutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14" />
      <path d="M10 8l-4 4 4 4M6 12h10" />
    </Icon>
  );
}

/** Three lines: the list view (Story 19.3). */
export function ListIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  );
}

/** A shop front: Butiker in Inställningar. */
export function StoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9l1.5-4.5h13L20 9" />
      <path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9" />
      <path d="M5.5 12v7.5h13V12" />
    </Icon>
  );
}

/** A globe: Receptsajter in Inställningar. */
export function GlobeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5S9.6 5.9 12 3.5z" />
    </Icon>
  );
}

/** A bookmark: Spara i Livskoll in Inställningar. */
export function BookmarkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 4h10v16l-5-3.5L7 20z" />
    </Icon>
  );
}

/** A sparkle: the AI model in Inställningar. */
export function SparkleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z" />
      <path d="M18.5 3.5v3M17 5h3" />
    </Icon>
  );
}

/** A coin: the month's cost in Inställningar. */
export function CoinIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.4 0-2.4.7-2.4 1.8 0 2.4 5 1.2 5 3.6 0 1.1-1 1.8-2.6 1.8-1.1 0-2.1-.4-2.6-1.2M12 6.5V8m0 8v1.5" />
    </Icon>
  );
}

/** A phone with an arrow: Installera appen in Inställningar. */
export function InstallIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6.5" y="3" width="11" height="18" rx="2.5" />
      <path d="M12 8v6m-2.5-2.5L12 14l2.5-2.5" />
    </Icon>
  );
}

/** A microphone: Siri och genvägar in Inställningar. */
export function MicIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
    </Icon>
  );
}

/** A picture: "Välj från Bilder". */
export function ImageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17l5-4.5 3.5 3L15 13l5 4.5" />
    </Icon>
  );
}

/** A tray, an inbox: Inkorg in Inställningar (Story 20.3). */
export function InboxIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 13l2.5-7.5h11L20 13v5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z" />
      <path d="M4 13h4.5l1 2h5l1-2H20" />
    </Icon>
  );
}

/** A padlock: Om din data, the one-time note on who sees the account's data (Story 17.2). */
export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
      <path d="M12 14.5v2" />
    </Icon>
  );
}

/** Two people (Story 21.2b): Medlemmar. */
export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M15.5 5.6a3 3 0 0 1 0 5.8M17 13.8a5.2 5.2 0 0 1 3.5 5.2" />
    </Icon>
  );
}

/** A chain link (Story 21.2b): an invitation waiting to be used. */
export function LinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </Icon>
  );
}

/** Out of a box (Story 21.2b): "Dela inbjudan". */
export function ShareIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5v11M8 7.5l4-4 4 4" />
      <path d="M8.5 10.5H7A1.5 1.5 0 0 0 5.5 12v7A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-1.5" />
    </Icon>
  );
}
