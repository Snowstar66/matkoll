"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AiWorking } from "@/components/ai-working";
import { cx } from "@/components/cx";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { ExternalIcon, RefreshIcon, StarIcon } from "@/components/icons";
import { ListGroup } from "@/components/list-group";
import { SwitchRow } from "@/components/switch-row";
import { errorMessages } from "@/lib/errors";
import { useOption } from "@/lib/use-option";
import {
  explainWorthButtonText,
  explainWorthFailedText,
  explainingWorthText,
  oneAiCallText,
  parseWorthDetail,
  recommendationLabel,
  recommendsNoText,
  recommendsYesText,
  updateWorthText,
  updatingWorthText,
  worthAppliedText,
  worthProposal,
  worthSwitchHints,
  type WorthState,
  worthConfidenceText,
  worthDetailHeadings,
  worthDisclaimerText,
  worthTitleText,
  type ThingWorth,
  type WorthConfidence,
} from "../domain/thing-worth";
import { phraseForSearch, soldLinks, soldSearchNoteText, soldSearchTitleText, soldSearchingText } from "../domain/worth-search";
import { setThingWorth } from "../actions/worth-state";
import { explainWorthDetail } from "./worth-client";

// Värdetips (Tillval): a small pill on a föremål's row ("★ Kan ha värde": a shape and words, never colour alone),
// and a quiet block in its sheet with the tip, how sure it is, and "Undersök värdet", which asks the AI once for
// why it was flagged, what it could be and what is worth checking, and keeps the answer. Both only show when the
// switch is on and the föremål has a tip.

const confidenceReading: Record<WorthConfidence, string> = { sure: "säker", guess: "gissning", unsure: "osäker" };

/**
 * The pill after a föremål's name on a row; nothing without a tip or with the switch off. It wraps to the next line with a long name.
 * `onMint` is for a row that is marked (mint): the pill is then white so it shows.
 */
export function WorthMarker({ worth, onMint = false }: { worth: ThingWorth | null | undefined; onMint?: boolean }) {
  const on = useOption("worthLook");
  if (!on || !worth) return null;
  return (
    <span
      data-testid="worth-marker"
      className={cx(
        "ml-2 inline-flex items-center gap-1 rounded-full py-0.5 pr-2.25 pl-1.5 align-middle text-badge font-semibold whitespace-nowrap text-star-ink",
        onMint ? "bg-surface" : "bg-star-tint",
      )}
    >
      <StarIcon size={13} className="shrink-0" />
      {worthTitleText}
      {worth.confidence ? <span className="sr-only">, {confidenceReading[worth.confidence]}</span> : null}
    </span>
  );
}

/**
 * The star on a photo, at the top right of a numbered marker (put it inside the marker; it follows its size and fade).
 * Decoration (aria-hidden): the list row says it in words. Nothing with the switch off.
 */
export function PhotoStar() {
  const on = useOption("worthLook");
  if (!on) return null;
  return (
    <span aria-hidden="true" data-testid="photo-star" className="pointer-events-none absolute -top-2.5 -right-2.25 size-4">
      <StarIcon size={16} sticker />
    </span>
  );
}

/**
 * "★ 2": how many föremål with a star a room, a card or a photo has, in a meta line. Nothing with the switch off or at
 * zero. The star is a decoration; a screen reader says "2 kan ha värde".
 */
export function StarCount({ count }: { count: number | null | undefined }) {
  const on = useOption("worthLook");
  if (!on || !count || count <= 0) return null;
  return (
    <span data-testid="star-count" className="whitespace-nowrap">
      <StarIcon size={12} className="mr-0.5 inline-block align-[-1px]" />
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">{count} {worthTitleText.toLowerCase()}</span>
    </span>
  );
}

/** " · ★ 2" in a meta line: the separator goes with the count, so nothing is left behind when there is none or the switch is off. */
export function StarCountAfter({ count }: { count: number | null | undefined }) {
  const on = useOption("worthLook");
  if (!on || !count || count <= 0) return null;
  return (
    <>
      {" · "}
      <StarCount count={count} />
    </>
  );
}

/** The kept explanation: its three labelled parts, or the text as it is when it is not in that shape. */
function WorthDetail({ text }: { text: string }) {
  const parts = parseWorthDetail(text);
  return (
    <div data-testid="worth-detail" className="flex flex-col gap-2.5 rounded-md bg-surface px-3 py-2.5 text-body text-ink">
      {parts ? (
        <>
          <section className="flex flex-col gap-0.5">
            <h3 className="text-meta font-semibold text-ink-2">{worthDetailHeadings.why}</h3>
            <p>{parts.why}</p>
          </section>
          <section className="flex flex-col gap-0.5">
            <h3 className="text-meta font-semibold text-ink-2">{worthDetailHeadings.couldBe}</h3>
            <p>{parts.couldBe}</p>
          </section>
          <section className="flex flex-col gap-0.5">
            <h3 className="text-meta font-semibold text-ink-2">{worthDetailHeadings.check}</h3>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {parts.checks.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <p className="whitespace-pre-line">{text}</p>
      )}
    </div>
  );
}

/**
 * "Se vad liknande har sålts för": three links that open a search for sold lookalikes on another site, in a new tab.
 * No price is shown here; the note says that the numbers are on the other site and depend on condition and mark.
 */
function SoldSearch({ phrase }: { phrase: string }) {
  const links = soldLinks(phrase);
  if (links.length === 0) return null;
  return (
    <div data-testid="worth-sold" className="flex flex-col gap-1">
      <p className="text-meta font-semibold text-ink-2">{soldSearchTitleText}</p>
      <ul role="list" className="flex flex-wrap gap-x-1 gap-y-0.5">
        {links.map((link) => (
          <li key={link.key}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`worth-sold-${link.key}`}
              className="inline-flex min-h-tap items-center gap-1 rounded-md px-2 text-meta font-medium text-accent"
            >
              {link.label}
              <span className="font-normal text-ink-2">({link.hint})</span>
              <ExternalIcon size={13} className="shrink-0" />
              <span className="sr-only">, öppnas på en annan sajt</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="text-meta text-ink-2" data-testid="worth-sold-phrase">
        {soldSearchingText(phrase)}
      </p>
      <p className="text-meta text-ink-2">{soldSearchNoteText}</p>
    </div>
  );
}

type Asking = "idle" | "asking" | "updating" | { error: string };

/** What the last assessment said, shown under the explanation until the sheet is closed. */
type Said = { recommends: boolean | null; appliedText: string | null; suggestion: boolean | null };

/**
 * In a föremål's sheet, under its name (Värdetips): the switch "Kan ha värde" (the user's own choice goes before the
 * AI's, both ways, with a line on who set it), the AI's tip when it is starred, and "Undersök värdet" for any föremål:
 * the AI's recommendation with its explanation, kept. The recommendation stars or unstars at once when the user has
 * never touched the star, else it is only offered as a button. "Uppdatera" at the end asks again. Key it on the
 * opening, so each starts fresh. Nothing with the Tillval switch off.
 */
export function WorthBlock({
  worth,
  state,
  thingId,
  name,
  canExamine = true,
}: {
  /** The star as the rows have it (kept for the tests of the rows); `state` carries the whole picture. */
  worth?: ThingWorth | null;
  state?: WorthState;
  thingId?: string;
  name?: string;
  /** A föremål without a photo (written or noted) cannot be examined. */
  canExamine?: boolean;
}) {
  const on = useOption("worthLook");
  const router = useRouter();
  const initial: WorthState =
    state ?? (worth ? { starred: true, setBy: worth.byUser ? "user" : "ai", tip: worth.confidence ? { why: worth.why, confidence: worth.confidence } : null, detail: worth.detail ?? null } : { starred: false, setBy: null, tip: null, detail: null });
  const [current, setCurrent] = useState<WorthState>(initial);
  const [asking, setAsking] = useState<Asking>("idle");
  const [said, setSaid] = useState<Said | null>(null);
  const [toggling, setToggling] = useState(false);
  if (!on || !thingId) return null;
  const shownDetail = current.detail;
  // The explanation's own phrase when it has one (older explanations have none), else the föremål's name.
  const phrase = phraseForSearch(shownDetail ? parseWorthDetail(shownDetail)?.search : null, name ?? "");
  const busy = asking === "asking" || asking === "updating";

  async function choose(starred: boolean) {
    if (!thingId || toggling) return;
    setToggling(true);
    const answer = await setThingWorth({ id: thingId, starred }).catch(() => null);
    setToggling(false);
    if (answer?.ok) {
      setCurrent((before) => ({ ...answer.data.state, detail: answer.data.state.detail ?? before.detail }));
      setSaid((before) => (before ? { ...before, suggestion: null } : before));
      router.refresh();
    } else {
      setAsking({ error: errorMessages[answer?.error.code ?? "things_item_failed"] ?? explainWorthFailedText });
    }
  }

  async function assess(refresh: boolean) {
    if (!thingId || busy) return;
    const wasAi = current.setBy === "ai";
    setAsking(refresh ? "updating" : "asking");
    const answer = await explainWorthDetail(thingId, refresh);
    if (answer.ok) {
      const result = answer.data;
      setCurrent(result.state);
      setSaid({
        recommends: result.recommends,
        appliedText: result.recommends === null ? null : worthAppliedText(result.recommends, result.applied, wasAi),
        suggestion: result.suggestion,
      });
      setAsking("idle");
      if (result.applied !== "unchanged") router.refresh();
    } else {
      setAsking({ error: errorMessages[answer.error.code] ?? explainWorthFailedText });
    }
  }

  const recommends = said?.recommends ?? (shownDetail ? (parseWorthDetail(shownDetail)?.recommends ?? null) : null);
  const proposal = said?.suggestion != null ? worthProposal(said.suggestion) : null;

  return (
    <section aria-label={worthTitleText} data-testid="worth-block" className="flex flex-col gap-2.5">
      <ListGroup label={worthTitleText}>
        <SwitchRow
          label={worthTitleText}
          icon={<StarIcon size={18} className="shrink-0" />}
          hint={worthSwitchHints[current.setBy ?? "none"]}
          on={current.starred}
          onToggle={() => void choose(!current.starred)}
          disabled={toggling}
        />
      </ListGroup>
      {current.starred ? (
        <div data-testid="worth-tip" className="flex flex-col gap-2 rounded-lg bg-bg px-3.5 py-3">
          {/* The kept explanation below says why in full; the tip's sentence is only here until there is one. */}
          {current.tip && !shownDetail ? <p className="text-body text-ink">{current.tip.why}</p> : null}
          <SoldSearch phrase={phrase} />
          <p className="text-meta text-ink-2">
            {current.tip ? (
              <>
                <span data-testid="worth-confidence">{worthConfidenceText(current.tip.confidence)}</span>.{" "}
              </>
            ) : null}
            {worthDisclaimerText}
          </p>
        </div>
      ) : null}
      {shownDetail ? (
        <>
          {/* One statement of what the AI thinks: the offer (a button) if there is one, else what was done to the star, else the recommendation. */}
          {recommends !== null && !proposal && !said?.appliedText ? (
            <p data-testid="worth-recommendation" className="text-body text-ink">
              {recommendationLabel} <strong className="font-semibold">{recommends ? recommendsYesText : recommendsNoText}</strong>
            </p>
          ) : null}
          {said?.appliedText && !proposal ? (
            <p data-testid="worth-applied" role="status" className="text-meta text-ink-2">
              {said.appliedText}
            </p>
          ) : null}
          <WorthDetail text={shownDetail} />
          {proposal ? (
            <div data-testid="worth-proposal" className="flex flex-col items-start gap-2 rounded-lg bg-bg px-3.5 py-3">
              <p className="text-body text-ink">{proposal.text}</p>
              <Button variant="secondary" onClick={() => void choose(said!.suggestion === true)} disabled={toggling}>
                {proposal.button}
              </Button>
            </div>
          ) : null}
          {canExamine ? (
            <div className="flex items-center gap-2">
              {asking === "updating" ? (
                <div role="status" data-testid="worth-updating">
                  <AiWorking size="sm" label={updatingWorthText} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void assess(true)}
                  disabled={busy}
                  className="inline-flex min-h-tap items-center gap-1.5 rounded-md px-1 text-meta font-medium text-accent"
                  data-testid="worth-update"
                >
                  <RefreshIcon size={14} className="shrink-0" />
                  {updateWorthText}
                  <span className="font-normal text-ink-3">{oneAiCallText}</span>
                </button>
              )}
            </div>
          ) : null}
        </>
      ) : canExamine ? (
        <div className="flex flex-col items-start gap-2">
          {asking === "asking" ? (
            <div role="status" data-testid="worth-explaining">
              <AiWorking size="sm" label={explainingWorthText} />
            </div>
          ) : (
            <Button variant="secondary" onClick={() => void assess(false)} data-testid="worth-explain">
              {explainWorthButtonText}
            </Button>
          )}
        </div>
      ) : null}
      {typeof asking === "object" ? <Notice role="alert">{asking.error}</Notice> : null}
    </section>
  );
}
