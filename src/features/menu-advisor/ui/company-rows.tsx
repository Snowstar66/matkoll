"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { cx } from "@/components/cx";
import { CheckIcon, ChevronRightIcon, PlusIcon } from "@/components/icons";
import { allergenLabels } from "../domain/labels";
import { profilesHref } from "../domain/people";
import type { Person } from "../domain/profile";
import { PersonAvatar } from "./person-avatar";

/** From this many people the list shows four rows and "Visa alla (n)". */
export const collapseFrom = 5;
const shownWhenCollapsed = 4;

/** The line under a name: "Gluten", "Gluten, nötter", or "Inga allergier angivna". */
export function allergyText(person: Pick<Person, "allergies">): string {
  if (person.allergies.length === 0) return "Inga allergier angivna";
  const words = person.allergies.map((allergen, index) => (index === 0 ? allergenLabels[allergen] : allergenLabels[allergen].toLocaleLowerCase("sv-SE")));
  return words.join(", ");
}

/**
 * Step 2, "Vilka äter?": a white list straight on the start screen, one row per person (a tick, the initial, the name
 * and the allergies under it). The whole row, 60 px at least, ticks and unticks. The last row, "Lägg till gäst", opens
 * a sheet: a person is added once, so the form stays out of the way. From five people four rows show, and the ticked
 * ones further down, with "Visa alla (n)".
 */
export function CompanyRows({
  people,
  chosenIds,
  tonightOnly,
  onToggle,
  onAdd,
}: {
  /** Everyone to pick from: the saved people, "Du" first, then the guests for tonight. */
  people: readonly Person[];
  chosenIds: ReadonlySet<string>;
  /** Guests added for tonight only (not saved). */
  tonightOnly: ReadonlySet<string>;
  onToggle: (personId: string) => void;
  onAdd: () => void;
}) {
  const id = useId();
  const [showAll, setShowAll] = useState(false);
  const collapsed = !showAll && people.length >= collapseFrom;
  const shown = collapsed ? people.filter((person, index) => index < shownWhenCollapsed || chosenIds.has(person.id)) : people;
  return (
    <section aria-labelledby={`${id}-label`} className="flex flex-col gap-2">
      <h2 id={`${id}-label`} className="px-1 text-section-label font-semibold text-ink-3">
        Vilka äter?
      </h2>
      <ul role="list" data-testid="menu-company" className="flex flex-col divide-y divide-hairline overflow-hidden rounded-xl bg-surface">
        {shown.map((person, index) => {
          const chosen = chosenIds.has(person.id);
          const line = tonightOnly.has(person.id) ? `${allergyText(person)} · bara ikväll` : allergyText(person);
          return (
            <li key={person.id}>
              <label
                data-testid="menu-company-person"
                className="flex min-h-15 cursor-pointer items-center gap-3 px-3.5 py-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent"
              >
                <input
                  type="checkbox"
                  checked={chosen}
                  onChange={() => onToggle(person.id)}
                  aria-label={person.name}
                  aria-describedby={`${id}-${index}`}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={cx(
                    "flex size-6.5 shrink-0 items-center justify-center rounded-full border-2",
                    chosen ? "border-accent bg-accent text-on-accent" : "border-ink-3 bg-surface",
                  )}
                >
                  {chosen ? <CheckIcon size={14} /> : null}
                </span>
                <PersonAvatar name={person.name} index={index} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-headline font-medium text-ink">{person.name}</span>
                  <span id={`${id}-${index}`} className={cx("text-meta", person.allergies.length > 0 ? "text-ink-2" : "text-ink-3")}>
                    {line}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
        {collapsed ? (
          <li>
            <button type="button" onClick={() => setShowAll(true)} className="flex min-h-tap w-full items-center px-3.5 text-left text-body font-medium text-accent">
              {`Visa alla (${people.length})`}
            </button>
          </li>
        ) : null}
        <li>
          <button type="button" data-testid="menu-guest-add" onClick={onAdd} className="flex min-h-15 w-full items-center gap-3 px-3.5 py-2 text-left text-headline font-medium text-accent">
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-accent">
              <PlusIcon size={18} />
            </span>
            Lägg till gäst
          </button>
        </li>
      </ul>
      <Link href={profilesHref} className="inline-flex min-h-tap items-center gap-1 self-start px-1 text-body font-medium text-accent">
        Smak och allergier
        <ChevronRightIcon size={18} />
      </Link>
    </section>
  );
}
