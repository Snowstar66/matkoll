"use client";

import { Chip } from "@/components/chip";
import { Segment } from "@/components/segment";
import { Stepper } from "@/components/stepper";
import { cuisines, maxCuisines, maxParty, maxPriorities, minParty, priorities, radiiM, type CuisineId, type PriorityId, type RestaurantSettings } from "../domain/types";
import { partyText, radiusLabels, texts } from "./format";

// The four choices of a search, shared by the question screen and the settings sheet: how far, how many, what to weigh,
// and "Sugen på". Chips toggle; at most three of each, so a weight stays a preference and never a filter.

const toggled = <T,>(list: readonly T[], item: T, max: number): T[] => (list.includes(item) ? list.filter((entry) => entry !== item) : list.length >= max ? [...list] : [...list, item]);

export function SettingsFields({ value, onChange }: { value: RestaurantSettings; onChange: (next: RestaurantSettings) => void }) {
  return (
    <div className="flex flex-col gap-5" data-testid="restaurant-fields">
      <section className="flex flex-col gap-2">
        <h3 className="text-meta font-semibold tracking-wide text-ink-3 uppercase">Avstånd och sällskap</h3>
        <div className="flex flex-col gap-3 rounded-xl bg-surface p-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-body text-ink">{texts.radiusLabel}</span>
            <Segment
              label={texts.radiusLabel}
              value={String(value.radiusM)}
              onChange={(radius) => onChange({ ...value, radiusM: Number(radius) as RestaurantSettings["radiusM"] })}
              options={radiiM.map((radius) => ({ value: String(radius), label: radiusLabels[radius] }))}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-body text-ink">{texts.partyLabel}</span>
            <Stepper
              compact
              onBg
              value={value.party}
              min={minParty}
              max={maxParty}
              format={partyText}
              decreaseLabel="Färre personer"
              increaseLabel="Fler personer"
              onChange={(party) => onChange({ ...value, party })}
            />
          </div>
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-meta font-semibold tracking-wide text-ink-3 uppercase">{texts.prioritiesLabel}</h3>
        <div role="group" aria-label={texts.prioritiesLabel} className="flex flex-wrap gap-2">
          {priorities.map((priority) => (
            <Chip key={priority.id} selected={value.priorities.includes(priority.id)} aria-pressed={value.priorities.includes(priority.id)} onClick={() => onChange({ ...value, priorities: toggled<PriorityId>(value.priorities, priority.id, maxPriorities) })}>
              {priority.label}
            </Chip>
          ))}
        </div>
        <p className="text-meta text-ink-2">{texts.prioritiesHint}</p>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-meta font-semibold tracking-wide text-ink-3 uppercase">{texts.cuisinesLabel}</h3>
        <div role="group" aria-label={texts.cuisinesLabel} className="flex flex-wrap gap-2">
          {cuisines.map((cuisine) => (
            <Chip key={cuisine.id} selected={value.cuisines.includes(cuisine.id)} aria-pressed={value.cuisines.includes(cuisine.id)} onClick={() => onChange({ ...value, cuisines: toggled<CuisineId>(value.cuisines, cuisine.id, maxCuisines) })}>
              {cuisine.label}
            </Chip>
          ))}
        </div>
        <p className="text-meta text-ink-2">{texts.cuisinesHint}</p>
      </section>
    </div>
  );
}
