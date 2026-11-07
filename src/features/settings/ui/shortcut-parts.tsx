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
    <details className="rounded-md bg-bg p-3" data-testid={testId}>
      <summary className="flex min-h-tap cursor-pointer items-center text-body text-ink">Bygg genvägen själv</summary>
      <div className="mt-2 flex flex-col gap-3">{children}</div>
    </details>
  );
}
