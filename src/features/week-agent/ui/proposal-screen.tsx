"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { AiWorking } from "@/components/ai-working";
import { Button, buttonClasses } from "@/components/button";
import { FixedAction } from "@/components/fixed-action";
import { InfoIcon, SlidersIcon, SparkleIcon, TrashIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { useOption } from "@/lib/use-option";
import type { WeekAgentModel } from "../actions/contract";
import type { ExcludedDish, WeekProposal } from "../domain/types";
import type { CostTexts, SettingsActions, SettingsContext, WeekAgentActions } from "./actions";
import { appliedText, dayWord, joinDays, summaryText } from "./format";
import { AlternativesSheet, HeaderMenu, ProposalRow } from "./proposal-parts";
import { SettingsSheet } from "./settings-sheet";

// "Förslag för vecka 47" (VK-F1 to VK-F5, VK-N2 to VK-N4): the week's dinners with a reason per day, what the user
// already fixed shown as "Din rätt" and locked, "Byt", a lock per day, "Gör om" for the unlocked days, "Gör noggrannare"
// (Sonnet) and "Använd veckan", which only fills empty days. Nothing is saved before "Använd veckan"; the draft stays
// in the database until then, so it is there when the user comes back. A Server Action that is slow, fails or is not
// there never leaves the screen empty: it says so and offers another try.

/** What the page read: the week's draft, if any. */
export type ProposalDraft = { id: string; proposal: WeekProposal; model: string | null };

export type ProposalScreenProps = {
  weekStart: string;
  weekNumber: number;
  /** Back to Matsedel on this week; also where "Använd veckan" goes. */
  backHref: string;
  /** Where recipes are added (Recept), for "för få recept". */
  recipesHref: string;
  initialDraft: ProposalDraft | null;
  /** No draft: ask for a proposal on arrival (the user tapped the card or "Gör om"). */
  autoStart: boolean;
  /** Matsedel's full week redone: these filled weekdays are the user's own and stay; the others are proposed again and written over. */
  redo?: { ownDays: number[] } | null;
  actions: WeekAgentActions;
  settings: { actions: SettingsActions; cost: CostTexts; preloaded?: SettingsContext | null };
  /** Takes `?gor-om` out of the address once the run has started, so a reload shows the draft instead of running again. */
  onStarted?: () => void;
};

type Phase =
  | { kind: "running"; reason: "plan" | "reroll" | "careful" }
  | { kind: "ready" }
  | { kind: "few"; needed: number; available: number }
  | { kind: "cap" }
  | { kind: "error"; message: string };

const failedText = "Det gick inte att ta fram ett förslag. Försök igen.";

export function ProposalScreen({ weekStart, weekNumber, backHref, recipesHref, initialDraft, autoStart, redo = null, actions, settings, onStarted }: ProposalScreenProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const on = useOption("weekAgent");
  const [draft, setDraft] = useState<ProposalDraft | null>(initialDraft);
  const [phase, setPhase] = useState<Phase>(initialDraft || !autoStart ? { kind: "ready" } : { kind: "running", reason: "plan" });
  const [excluded, setExcluded] = useState<ExcludedDish[]>([]);
  const [showExcluded, setShowExcluded] = useState(false);
  const [model, setModel] = useState<WeekAgentModel | string | null>(initialDraft?.model ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [swapDay, setSwapDay] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "overwrite" | "discard">(null);
  const [conflict, setConflict] = useState<null | { written: number[]; skipped: number[] }>(null);
  const [busy, setBusy] = useState(false);
  // The redo is meant for the run that was asked for; once it has happened the draft is what is shown and applied.
  const overwrite = redo !== null;
  const started = useRef(false);
  const cancelled = useRef(false);

  const proposal = draft?.proposal ?? null;

  const run = useCallback(
    async (mode: "plan" | "reroll" | "careful", current: ProposalDraft | null) => {
      setPhase({ kind: "running", reason: mode });
      setNotice(null);
      setStatus(null);
      const locked = current ? current.proposal.days.filter((day) => day.locked).map((day) => day.dayIndex) : redo ? redo.ownDays : undefined;
      let result;
      try {
        result = await actions.propose({ weekStart, mode, ...(locked ? { lockedDays: locked } : {}) });
      } catch {
        if (cancelled.current) return;
        if (current) {
          setPhase({ kind: "ready" });
          setNotice(failedText);
        } else setPhase({ kind: "error", message: failedText });
        return;
      }
      if (cancelled.current) return;
      if (result.status === "ok") {
        const before = current?.proposal.days ?? [];
        const changed = result.proposal.days.filter((day) => day.source === "proposed" && day.recipeId !== before.find((old) => old.dayIndex === day.dayIndex)?.recipeId).length;
        const fixed = result.proposal.days.filter((day) => day.locked).length;
        setDraft({ id: result.draftId, proposal: result.proposal, model: result.model });
        setModel(result.model);
        setExcluded(result.excludedForAllergy);
        setPhase({ kind: "ready" });
        if (mode !== "plan") setStatus(`Bytte ${changed === 1 ? "1 dag" : `${changed} dagar`}.${fixed > 0 ? ` ${fixed === 1 ? "Din låsta ligger" : `Dina ${fixed} låsta ligger`} kvar.` : ""}`);
        return;
      }
      if (result.status === "too_few_recipes") {
        setExcluded(result.excludedForAllergy);
        setPhase({ kind: "few", needed: result.needed, available: result.available });
      } else if (result.status === "cap_reached") setPhase({ kind: "cap" });
      else if (current) {
        setPhase({ kind: "ready" });
        setNotice(result.message);
      } else setPhase({ kind: "error", message: result.message });
    },
    [actions, redo, weekStart],
  );

  // The user tapped the card: the run starts on arrival (once; Strict Mode runs effects twice).
  useEffect(() => {
    if (started.current || initialDraft || !autoStart) return;
    started.current = true;
    onStarted?.();
    void run("plan", null);
  }, [autoStart, initialDraft, onStarted, run]);
  useEffect(() => {
    // Set again on every mount: Strict Mode runs the cleanup once before the screen is really left.
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  if (!on) {
    return (
      <>
        <PageHeader title={`Förslag för vecka ${weekNumber}`} backHref={backHref} backLabel="Matsedel" />
        <Notice>Veckoagenten är av. Slå på den under Inställningar, Tillval.</Notice>
      </>
    );
  }

  const days = proposal?.days ?? [];
  const dinners = days.filter((day) => day.slot === "dinner");
  const fixed = dinners.filter((day) => day.source === "fixed").length;
  const lockedByUser = dinners.filter((day) => day.source === "proposed" && day.locked).length;
  const proposedCount = dinners.filter((day) => day.source === "proposed").length;
  const unlocked = dinners.filter((day) => !day.locked).length;
  const writable = dinners.filter((day) => day.source === "proposed" && day.recipeId !== null).length;
  const off = days.filter((day) => day.slot !== "dinner");
  const running = phase.kind === "running";
  const rules = model === "rules";

  async function toggleLock(dayIndex: number, locked: boolean) {
    if (!draft || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await actions.setLock({ draftId: draft.id, dayIndex, locked });
      if (result.status === "ok") setDraft({ ...draft, proposal: result.proposal });
      else setNotice(result.message);
    } catch {
      setNotice("Det gick inte att låsa dagen. Försök igen.");
    } finally {
      setBusy(false);
    }
  }

  async function finish(written: number[], kept: number, draftId: string) {
    const undo = actions.undo;
    router.push(backHref);
    showToast(appliedText(written.length, kept), {
      durationMs: 10_000,
      ...(undo
        ? {
            onUndo: () => {
              undo({ draftId }).then(
                (result) => {
                  if (result.status === "ok") {
                    router.refresh();
                    showToast("Ångrade. Veckan är som förut.");
                  } else showToast(result.message, { role: "alert" });
                },
                () => showToast("Det gick inte att ångra.", { role: "alert" }),
              );
            },
          }
        : {}),
    });
  }

  async function apply(withOverwrite: boolean) {
    if (!draft || busy) return;
    setBusy(true);
    setNotice(null);
    setConfirm(null);
    try {
      const result = await actions.apply({ draftId: draft.id, weekStart, ...(withOverwrite ? { overwrite: true } : {}) });
      if (result.status === "error") {
        setNotice(result.message);
        return;
      }
      if (result.skippedOccupied.length > 0 && !withOverwrite) {
        // Someone filled a day since the proposal was made: nothing is written over it without a clear yes.
        setConflict({ written: result.written, skipped: result.skippedOccupied });
        return;
      }
      setConflict(null);
      await finish(result.written, fixed, draft.id);
    } catch {
      setNotice("Det gick inte att spara veckan. Inget ändrades. Försök igen.");
    } finally {
      setBusy(false);
    }
  }

  function onUse() {
    if (overwrite) setConfirm("overwrite");
    else void apply(false);
  }

  async function discard() {
    if (!draft || busy) return;
    setBusy(true);
    setConfirm(null);
    try {
      const result = await actions.discard({ draftId: draft.id });
      if (result.status === "ok") {
        router.push(backHref);
        showToast("Utkastet slängdes.");
        return;
      }
      setNotice(result.message);
    } catch {
      setNotice("Det gick inte att slänga utkastet. Försök igen.");
    } finally {
      setBusy(false);
    }
  }

  const title = `Förslag för vecka ${weekNumber}`;
  const menu = draft ? (
    <HeaderMenu
      label="Fler val för förslaget"
      disabled={busy || running}
      items={[
        { id: "careful", title: "Gör noggrannare", hint: `Tar längre tid och kostar ${settings.cost.careful} i stället för ${settings.cost.standard}`, icon: <SparkleIcon size={22} />, onSelect: () => void run("careful", draft) },
        { id: "settings", title: "Ställ in", hint: "Middagar, budget, butiker", icon: <SlidersIcon size={22} />, onSelect: () => setSettingsOpen(true) },
        { id: "discard", title: "Släng utkast", hint: "Inget sparades i Matsedel", icon: <TrashIcon size={22} />, onSelect: () => setConfirm("discard"), danger: true },
      ]}
    />
  ) : null;

  return (
    <div data-testid="week-agent-proposal">
      <PageHeader title={title} backHref={backHref} backLabel="Matsedel" action={menu} />
      <div className="flex flex-col gap-3 pb-4">
        {running && !draft ? (
          <div data-testid="week-agent-running" className="flex flex-col gap-4 py-6">
            <AiWorking steps={["Planerar veckan …", "Väljer bland dina recept …", "Kollar allergier …"]} />
            <p className="text-meta text-ink-2">Tar några sekunder. Inget sparas förrän du säger ja.</p>
            <Link href={backHref} className={buttonClasses("secondary")}>
              Avbryt
            </Link>
          </div>
        ) : null}

        {phase.kind === "error" ? (
          <div className="flex flex-col gap-3" data-testid="week-agent-error">
            <Notice role="alert">{phase.message}</Notice>
            <Button variant="secondary" fullWidth onClick={() => void run("plan", null)}>
              Försök igen
            </Button>
          </div>
        ) : null}

        {phase.kind === "few" ? (
          <div className="flex flex-col gap-3" data-testid="week-agent-few">
            <div className="flex gap-3 rounded-lg bg-sand p-3.5 text-sand-ink">
              <InfoIcon size={22} className="mt-px shrink-0" />
              <div className="flex flex-col gap-1">
                <p className="text-headline">För få recept för ett veckoförslag</p>
                <p className="text-control">
                  Du har {phase.available} recept som passar hela hushållet. För ett veckoförslag behövs minst {phase.needed}. Lägg till recept eller få nya idéer med erbjudanden.
                </p>
              </div>
            </div>
            {excluded.length > 0 ? <ExcludedNote excluded={excluded} open={showExcluded} onToggle={() => setShowExcluded((value) => !value)} /> : null}
            <Link href={recipesHref} className={buttonClasses("primary", true)} data-testid="week-agent-add-recipes">
              Lägg till recept
            </Link>
            <Link href={backHref} className={buttonClasses("secondary", true)}>
              Se Nya idéer med erbjudanden
            </Link>
          </div>
        ) : null}

        {phase.kind === "cap" ? (
          <div className="flex flex-col gap-3" data-testid="week-agent-cap">
            <div className="flex gap-3 rounded-lg bg-sand p-3.5 text-sand-ink">
              <InfoIcon size={22} className="mt-px shrink-0" />
              <div className="flex flex-col gap-1">
                <p className="text-headline">AI-taket för idag är nått</p>
                <p className="text-control">Hushållet har använt dagens AI-budget, så inget nytt förslag kan tas fram nu. Försök igen i morgon. Den som äger appen ser vad som har kostat under AI-kostnad.</p>
              </div>
            </div>
            <Link href="/installningar/ai-kostnad" className={buttonClasses("secondary", true)} data-testid="week-agent-cap-cost">
              Se AI-kostnad
            </Link>
            <Link href={backHref} className={buttonClasses("text", true)}>
              Tillbaka till Matsedel
            </Link>
          </div>
        ) : null}

        {phase.kind === "ready" && !draft ? (
          <div className="flex flex-col gap-3 py-6" data-testid="week-agent-nodraft">
            <p className="text-body text-ink-2">Inget utkast för vecka {weekNumber} än. Ett förslag tas fram av dina recept och sparas inte förrän du trycker Använd veckan.</p>
            <Button fullWidth onClick={() => void run("plan", null)}>
              Föreslå veckan
            </Button>
          </div>
        ) : null}

        {draft && proposal ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className={rules ? "rounded-full bg-sand px-2.5 py-0.5 text-badge font-semibold text-sand-ink" : "rounded-full bg-mint px-2.5 py-0.5 text-badge font-semibold text-mint-ink"} data-testid="proposal-pill">
                {rules ? "Enkelt förslag" : "Utkast"}
              </span>
              <p className="min-w-0 flex-1 text-body text-ink-2" data-testid="proposal-summary">
                {summaryText(proposedCount, fixed, lockedByUser)}
              </p>
            </div>
            {rules ? <Notice>Förslaget är framräknat av appen utan AI, så förklaringarna är kortare.</Notice> : null}
            {notice ? <Notice role="alert">{notice}</Notice> : null}
            <p role="status" className="empty:hidden text-meta font-semibold text-mint-ink" data-testid="proposal-status">
              {status}
            </p>
            <ul className="flex flex-col gap-2" aria-label={title}>
              {dinners.map((day) => (
                <ProposalRow
                  key={day.dayIndex}
                  weekStart={weekStart}
                  day={day}
                  loading={running && !day.locked}
                  disabled={busy || running}
                  onSwap={() => setSwapDay(day.dayIndex)}
                  onToggleLock={() => void toggleLock(day.dayIndex, !day.locked)}
                />
              ))}
            </ul>
            {off.length > 0 ? (
              <p className="text-meta text-ink-2" data-testid="proposal-off">
                Ingen middag planerad {joinDays(off.map((day) => day.dayIndex))}
                {off.every((day) => day.slot === "leftover") ? " (matlåda)" : off.some((day) => day.slot === "leftover") ? " (hoppad över eller matlåda)" : " (hoppad över)"}. Ändra under Ställ in.
              </p>
            ) : null}
            {dinners.some((day) => day.source === "fixed" && day.allergyWarning) ? (
              <p className="flex gap-2 text-meta text-ink-2">
                <InfoIcon size={18} className="mt-px shrink-0" />
                En rätt du själv lagt dit kan innehålla en allergen. Den ligger kvar, märkt med vem det gäller. Agenten tar aldrig bort eller byter en rätt du lagt dit.
              </p>
            ) : null}
            {excluded.length > 0 ? <ExcludedNote excluded={excluded} open={showExcluded} onToggle={() => setShowExcluded((value) => !value)} /> : null}
            <FixedAction reserve={2} stack>
              <Button fullWidth disabled={busy || running || writable === 0} onClick={onUse} data-testid="proposal-use">
                Använd veckan
              </Button>
              <Button variant="secondary" fullWidth disabled={busy || running || unlocked === 0} onClick={() => void run("reroll", draft)} data-testid="proposal-reroll">
                {fixed + lockedByUser > 0 ? `Gör om ${unlocked} olåsta` : "Gör om"}
              </Button>
            </FixedAction>
          </>
        ) : null}
      </div>

      {draft ? <AlternativesSheet open={swapDay !== null} onClose={() => setSwapDay(null)} draftId={draft.id} dayIndex={swapDay ?? 1} actions={actions} onChosen={(next) => { setDraft({ ...draft, proposal: next }); setSwapDay(null); }} /> : null}
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} actions={settings.actions} cost={settings.cost} preloaded={settings.preloaded} />

      <Sheet
        open={confirm === "overwrite"}
        onClose={() => setConfirm(null)}
        title={`Byta ut ${proposedCount === 1 ? "1 rätt" : `${proposedCount} rätter`} i Matsedel?`}
        closeLabel="Avbryt"
        footer={
          <>
            <Button fullWidth onClick={() => void apply(true)} disabled={busy}>
              Byt ut och använd
            </Button>
            <Button variant="text" fullWidth onClick={() => setConfirm(null)}>
              Avbryt
            </Button>
          </>
        }
      >
        <p className="text-body text-ink-2">Dagarna får de nya rätterna i stället för dem som ligger där nu. {fixed > 0 ? `${fixed === 1 ? "Din egen rätt ligger" : `Dina ${fixed} egna rätter ligger`} kvar.` : ""} Du kan ångra i tio sekunder.</p>
      </Sheet>

      <Sheet
        open={confirm === "discard"}
        onClose={() => setConfirm(null)}
        title="Släng utkastet?"
        closeLabel="Avbryt"
        footer={
          <>
            <Button variant="danger-confirm" fullWidth onClick={() => void discard()} disabled={busy}>
              Släng utkast
            </Button>
            <Button variant="text" fullWidth onClick={() => setConfirm(null)}>
              Behåll
            </Button>
          </>
        }
      >
        <p className="text-body text-ink-2">Förslaget försvinner. Inget har sparats i Matsedel.</p>
      </Sheet>

      <Sheet
        open={conflict !== null}
        onClose={() => {
          // Closing is the same as "Behåll mina": what was empty is filled, and nothing else is touched.
          const current = conflict;
          setConflict(null);
          if (current && draft) void finish(current.written, fixed, draft.id);
        }}
        title={conflict && conflict.skipped.length === 1 ? `${dayWord(conflict.skipped[0] ?? 1)[0]?.toUpperCase()}${dayWord(conflict.skipped[0] ?? 1).slice(1)} har fått en rätt` : "Några dagar har fått en rätt"}
        closeLabel="Behåll mina"
        footer={
          <>
            <Button
              fullWidth
              onClick={() => {
                const current = conflict;
                setConflict(null);
                if (current && draft) void finish(current.written, fixed, draft.id);
              }}
            >
              Behåll mina
            </Button>
            <Button variant="secondary" fullWidth disabled={busy} onClick={() => void apply(true)} data-testid="proposal-conflict-replace">
              Byt till förslaget
            </Button>
          </>
        }
      >
        <p className="text-body text-ink-2" data-testid="proposal-conflict">
          Sedan förslaget togs fram har {joinDays(conflict?.skipped ?? [])} fått en rätt (kanske av någon annan i hushållet). Resten av veckan är sparad. Ingenting skrivs över utan ditt tryck.
        </p>
      </Sheet>
    </div>
  );
}

function ExcludedNote({ excluded, open, onToggle }: { excluded: ExcludedDish[]; open: boolean; onToggle: () => void }) {
  const count = excluded.length;
  return (
    <div className="flex flex-col gap-1 rounded-md bg-surface p-3" data-testid="proposal-excluded">
      <div className="flex items-start gap-2 text-meta text-ink-2">
        <InfoIcon size={18} className="mt-px shrink-0" />
        <p className="min-w-0 flex-1">
          {count === 1 ? "1 recept lämnades utanför" : `${count} recept lämnades utanför`} för att {count === 1 ? "det" : "de"} kan innehålla en allergen.
        </p>
        <Button variant="compact" aria-expanded={open} onClick={onToggle}>
          {open ? "Dölj" : "Visa"}
        </Button>
      </div>
      {open ? (
        <ul className="pl-7 text-meta text-ink-2" data-testid="proposal-excluded-list">
          {excluded.map((dish) => (
            <li key={dish.recipeId}>
              {dish.title} ({dish.allergens.join(", ")})
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
