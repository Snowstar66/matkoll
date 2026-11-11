"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useId, useState } from "react";
import { Button } from "@/components/button";
import { CheckIcon, SparkleIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { Segment } from "@/components/segment";
import { Sheet } from "@/components/sheet";
import { Stepper } from "@/components/stepper";
import { SwitchRow } from "@/components/switch-row";
import { useToast } from "@/components/toast";
import { cx } from "@/components/cx";
import { budgets, maxDinners, minDinners, toStoredSettings, type Budget, type WeekAgentSettings } from "../domain/settings";
import type { CostTexts, SettingsActions, SettingsContext } from "./actions";
import { dayInitials, dayWord } from "./format";

// "Ställ in veckoförslaget" (VK-S1): one sheet for the household's choices, saved per household in the database
// (every phone gets the same proposal). Nothing has to be changed: with the defaults the agent works from what the
// household already said about allergies and tastes. The sheet reads the settings and the followed stores when it
// opens (the page behind never waits for them) unless the caller has them already.

export type SettingsSheetProps = {
  open: boolean;
  onClose: () => void;
  actions: SettingsActions;
  cost: CostTexts;
  /** The settings and stores when the page has them already (the proposal screen); else the sheet loads them. */
  preloaded?: SettingsContext | null;
  /** Called with what was saved. */
  onSaved?: (settings: WeekAgentSettings) => void;
};

const budgetOptions = [
  { value: "normal", label: "Normal" },
  { value: "low", label: "Lågt" },
] as const satisfies readonly { value: Budget; label: string }[];

const toggled = (days: readonly number[], day: number): number[] => (days.includes(day) ? days.filter((entry) => entry !== day) : [...days, day].sort((a, b) => a - b));

type DayRole = "vegetarianDays" | "skipDays" | "leftoverDays";

/** Mån-Sön as seven buttons, each at least 44 px wide to tap; the name of the day is read out. */
function DayPicker({ label, hint, value, onToggle }: { label: string; hint: string; value: readonly number[]; onToggle: (day: number) => void }) {
  const hintId = useId();
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <span className="flex flex-col">
        <span className="text-body text-ink">{label}</span>
        <span id={hintId} className="text-meta text-ink-2">
          {hint}
        </span>
      </span>
      <div role="group" aria-label={label} aria-describedby={hintId} className="flex gap-1">
        {dayInitials.map((initial, index) => {
          const day = index + 1;
          const on = value.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={on}
              aria-label={dayWord(day)}
              onClick={() => onToggle(day)}
              className={cx(
                "flex min-h-tap min-w-0 flex-1 items-center justify-center rounded-md text-control outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                on ? "bg-accent font-semibold text-on-accent" : "bg-fill text-ink-2",
              )}
            >
              {initial}
            </button>
          );
        })}
      </div>
    </li>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="mb-4">
      <h3 className="mx-1 mb-2 text-section-label text-ink-2 uppercase">{label}</h3>
      <ul className="flex flex-col divide-y divide-hairline overflow-hidden rounded-lg bg-surface">{children}</ul>
    </section>
  );
}

export function SettingsSheet({ open, onClose, actions, cost, preloaded = null, onSaved }: SettingsSheetProps) {
  const { showToast } = useToast();
  const [context, setContext] = useState<SettingsContext | null>(preloaded);
  const [draft, setDraft] = useState<WeekAgentSettings | null>(preloaded?.settings ?? null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // A fresh form each time it opens (adjusted while rendering, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(context?.settings ?? null);
      setNotice(null);
      setLoadFailed(false);
    }
  }

  // Read when the sheet opens, once; a failed read can be tried again by closing and opening it.
  const { load } = actions;
  useEffect(() => {
    if (!open || context) return;
    let live = true;
    load().then(
      (loaded) => {
        if (!live) return;
        if (loaded) {
          setContext(loaded);
          setDraft(loaded.settings);
        } else setLoadFailed(true);
      },
      () => live && setLoadFailed(true),
    );
    return () => {
      live = false;
    };
  }, [open, context, load]);

  const settings = draft;
  const dirty = settings !== null && context !== null && JSON.stringify(settings) !== JSON.stringify(context.settings);
  const patch = (change: Partial<WeekAgentSettings>) => setDraft((current) => (current ? { ...current, ...change } : current));

  /** The day gets this role and loses the other two (a day has one role). */
  function toggleRole(role: DayRole, day: number) {
    setDraft((current) => {
      if (!current) return current;
      const has = current[role].includes(day);
      const next = { ...current, vegetarianDays: current.vegetarianDays.filter((d) => d !== day), skipDays: current.skipDays.filter((d) => d !== day), leftoverDays: current.leftoverDays.filter((d) => d !== day) };
      return has ? { ...next, [role]: current[role].filter((d) => d !== day) } : { ...next, [role]: toggled(current[role], day) };
    });
  }

  function toggleStore(id: string) {
    setDraft((current) => (current ? { ...current, offerStoreIds: current.offerStoreIds.includes(id) ? current.offerStoreIds.filter((s) => s !== id) : [...current.offerStoreIds, id] } : current));
  }

  async function save() {
    if (!settings || busy) return;
    let stored: WeekAgentSettings;
    try {
      stored = toStoredSettings(settings);
    } catch {
      setNotice("Något i valen går inte att spara. Ändra och försök igen.");
      return;
    }
    setBusy(true);
    setNotice(null);
    let result;
    try {
      result = await actions.save(stored);
    } catch {
      result = { status: "error" as const, message: "Det gick inte att spara. Försök igen." };
    }
    setBusy(false);
    if (result.status === "error") {
      setNotice(result.message);
      return;
    }
    setContext((current) => (current ? { ...current, settings: stored } : current));
    onSaved?.(stored);
    onClose();
    showToast("Veckoförslagets val är sparade.");
  }

  const stores = context?.stores ?? [];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ställ in veckoförslaget"
      closeLabel="Avbryt"
      isDirty={dirty}
      preventClose={busy}
      footer={
        <Button fullWidth disabled={!dirty || busy} onClick={save} data-testid="week-agent-settings-save">
          Spara
        </Button>
      }
    >
      {!settings ? (
        loadFailed ? (
          <Notice role="alert">Det gick inte att läsa valen. Stäng och försök igen.</Notice>
        ) : (
          <p role="status" className="py-6 text-center text-body text-ink-2">
            Hämtar valen …
          </p>
        )
      ) : (
        <div data-testid="week-agent-settings">
          <p className="mb-4 text-body text-ink-2">
            <span className="mr-2 inline-flex rounded-full bg-mint px-2.5 py-0.5 text-badge font-semibold text-mint-ink">Hushållet</span>
            Gäller för hela hushållet. Utan att ändra något fungerar det med det du redan har sagt om allergier och smak.
          </p>
          <Group label="Standard, fungerar utan inställning">
            <li className="flex flex-col px-4 py-3">
              <span className="text-body text-ink">Allergier och smak</span>
              <span className="text-meta text-ink-2">Hämtas från Hushållet. Allergier tas aldrig bort eller gissas.</span>
            </li>
            <SwitchRow label="Det som snart går ut" hint="Äts först" on={settings.useSoonFirst} onToggle={() => patch({ useSoonFirst: !settings.useSoonFirst })} />
            <SwitchRow label="Erbjudanden i veckan" hint="Rätter med extrapris väljs oftare" on={settings.favourOffers} onToggle={() => patch({ favourOffers: !settings.favourOffers })} />
          </Group>
          <Group label="Du kan välja">
            <li className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
              <span className="flex min-w-0 flex-col">
                <span className="text-body text-ink">Middagar</span>
                <span className="text-meta text-ink-2">Övriga dagar lämnas tomma</span>
              </span>
              <Stepper
                compact
                onBg
                value={settings.dinners}
                min={minDinners}
                max={maxDinners}
                onChange={(dinners) => patch({ dinners })}
                format={(n) => `${n} middagar`}
                decreaseLabel="Färre middagar"
                increaseLabel="Fler middagar"
              />
            </li>
            <li className="flex flex-col gap-2 px-4 py-3">
              <span className="flex flex-col">
                <span className="text-body text-ink">Budget</span>
                <span className="text-meta text-ink-2">Lågt väljer mer från skafferi, erbjudanden och vegetariskt</span>
              </span>
              <Segment label="Budget" options={budgetOptions} value={settings.budget} onChange={(value) => patch({ budget: budgets.includes(value) ? value : "normal" })} />
            </li>
            <DayPicker label="Vegetariska dagar" hint="Inget kött de dagarna" value={settings.vegetarianDays} onToggle={(day) => toggleRole("vegetarianDays", day)} />
            <DayPicker label="Hoppa över dagar" hint="Inget förslag de dagarna" value={settings.skipDays} onToggle={(day) => toggleRole("skipDays", day)} />
            <DayPicker label="Matlådedagar" hint="Rester från dagen innan" value={settings.leftoverDays} onToggle={(day) => toggleRole("leftoverDays", day)} />
            <SwitchRow label="Snabbt på vardagar" hint="Lugnare rätter på helgen" on={settings.quickWeekdays} onToggle={() => patch({ quickWeekdays: !settings.quickWeekdays })} />
            <li className="flex flex-col gap-1 px-4 py-3">
              <span className="text-body text-ink">Butiker för erbjudanden</span>
              {stores.length === 0 ? (
                <span className="text-meta text-ink-2">Inga butiker än. Lägg till en under Inställningar, Butiker.</span>
              ) : (
                <>
                  <span className="text-meta text-ink-2">{settings.offerStoreIds.length === 0 ? "Inget valt: alla dina butiker räknas." : "Bara de du valt räknas."}</span>
                  <div role="group" aria-label="Butiker för erbjudanden" className="mt-1 flex flex-col">
                    {stores.map((store) => {
                      const on = settings.offerStoreIds.includes(store.id);
                      return (
                        <button
                          key={store.id}
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          onClick={() => toggleStore(store.id)}
                          className="flex min-h-tap items-center justify-between gap-3 text-left text-body text-ink"
                        >
                          <span className="min-w-0 break-words">{store.name}</span>
                          <span aria-hidden="true" className={cx("flex size-6 shrink-0 items-center justify-center rounded-full", on ? "bg-accent text-on-accent" : "border border-border")}>
                            {on ? <CheckIcon size={16} /> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </li>
          </Group>
          <p className="flex gap-3 rounded-md bg-mint p-3 text-control text-mint-ink" data-testid="week-agent-cost">
            <SparkleIcon size={20} className="mt-px shrink-0" />
            <span>
              {cost.standard} per förslag med Haiku. Gör noggrannare (Sonnet) kostar {cost.careful}.{" "}
              <Link href="/installningar/ai-kostnad" className="font-semibold underline">
                Se AI-kostnad
              </Link>
              .
            </span>
          </p>
          {notice ? (
            <div className="mt-3">
              <Notice role="alert">{notice}</Notice>
            </div>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}
