import { cx } from "@/components/cx";

const tones = ["bg-mint text-mint-ink", "bg-sky text-sky-ink", "bg-sand text-sand-ink"] as const;

/** A round letter for a person; the colour follows the person's place in the company, so it stays the same on every screen. */
export function PersonAvatar({ name, index, size = "md", className }: { name: string; index: number; size?: "sm" | "md"; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-pill text-meta font-semibold",
        size === "md" ? "size-8" : "size-7",
        tones[index % tones.length],
        className,
      )}
    >
      {name.trim().charAt(0).toLocaleUpperCase("sv-SE")}
    </span>
  );
}

/** The overlapping row of avatars on the start screen. */
export function AvatarStack({ names }: { names: readonly string[] }) {
  return (
    <span aria-hidden="true" className="flex shrink-0">
      {names.slice(0, 3).map((name, index) => (
        <PersonAvatar key={`${name}-${index}`} name={name} index={index} className={cx("border-2 border-surface", index > 0 && "-ml-2")} />
      ))}
    </span>
  );
}
