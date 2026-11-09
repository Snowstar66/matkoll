"use client";

import { useId } from "react";
import { Chip } from "@/components/chip";
import { allergenIcons, allergenLabels } from "../domain/labels";
import { menuAllergens, type MenuAllergen } from "../domain/types";

/** "Jag undviker": what to mark in the menu right now. Nothing here is saved; it is gone when the page closes. */
export function AvoidPanel({
  avoid,
  onAvoid,
  dislikes,
  onDislikes,
}: {
  avoid: MenuAllergen[];
  onAvoid: (avoid: MenuAllergen[]) => void;
  dislikes: string;
  onDislikes: (text: string) => void;
}) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-2 rounded-lg bg-surface p-4">
      <h2 id={`${id}-title`} className="text-section-label text-ink-2 uppercase">
        Jag undviker
      </h2>
      <div className="flex flex-wrap gap-x-2 gap-y-3" role="group" aria-label="Allergier">
        {menuAllergens.map((allergen) => (
          <Chip
            key={allergen}
            selected={avoid.includes(allergen)}
            icon={allergenIcons[allergen]}
            aria-pressed={avoid.includes(allergen)}
            onClick={() => onAvoid(avoid.includes(allergen) ? avoid.filter((entry) => entry !== allergen) : [...avoid, allergen])}
          >
            {allergenLabels[allergen]}
          </Chip>
        ))}
      </div>
      <label htmlFor={`${id}-dislikes`} className="mt-1 text-meta text-ink-2">
        Ogillar (till exempel svamp, koriander)
      </label>
      <input
        id={`${id}-dislikes`}
        data-testid="menu-dislikes"
        value={dislikes}
        maxLength={120}
        onChange={(event) => onDislikes(event.target.value)}
        className="h-button rounded-md border border-border bg-surface px-4 text-body text-ink"
      />
      <p className="text-meta text-ink-3">Sparas inte. Det gäller bara nu.</p>
    </section>
  );
}
