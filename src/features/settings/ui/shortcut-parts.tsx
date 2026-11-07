import { ChevronDownIcon } from "@/components/icons";
import type { ReactNode } from "react";

export const cardClass = "flex flex-col gap-3 rounded-lg bg-surface p-4";

/** The shortcut's button: opens the shared iCloud link (Genvägar asks to add it). */
export function AddShortcutButton({ url }: { url: string }) {
  return (
    <a
      href={url}
      data-testid="add-shortcut"
      className="flex min-h-tap w-full items-center justify-center rounded-full bg-accent px-4 text-body font-medium text-on-accent"
    >
      Lägg till genvägen
    </a>
  );
}

/** "Bygg genvägen själv": the manual steps, folded away. */
export function BuildItYourself({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <details className="group rounded-md bg-bg p-3" data-testid={testId}>
      <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between gap-2 text-body text-ink [&::-webkit-details-marker]:hidden">
        Bygg genvägen själv
        <ChevronDownIcon size={20} className="shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2 flex flex-col gap-3">{children}</div>
    </details>
  );
}
