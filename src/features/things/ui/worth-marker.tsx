"use client";

import { useState } from "react";
import { AiWorking } from "@/components/ai-working";
import { cx } from "@/components/cx";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { ExternalIcon, StarIcon } from "@/components/icons";
import { errorMessages } from "@/lib/errors";
import { useOption } from "@/lib/use-option";
import {
  explainWorthButtonText,
  explainWorthFailedText,
  explainingWorthText,
  parseWorthDetail,
  worthConfidenceText,
  worthDetailHeadings,
  worthDisclaimerText,
  worthTitleText,
  type ThingWorth,
  type WorthConfidence,
} from "../domain/thing-worth";
import { phraseForSearch, soldLinks, soldSearchNoteText, soldSearchTitleText, soldSearchingText } from "../domain/worth-search";
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
      <span className="sr-only">, {confidenceReading[worth.confidence]}</span>
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

type Asking = "idle" | "asking" | { error: string };

/**
 * Under a föremål's name in its sheet: "Kan ha värde", the sentence, how sure, and that it is a tip. With the föremål's
 * id there is also "Undersök värdet" (and the explanation once it is there); key it on the opening, so each starts fresh.
 */
export function WorthBlock({ worth, thingId, name }: { worth: ThingWorth | null | undefined; thingId?: string; name?: string }) {
  const on = useOption("worthLook");
  const [detail, setDetail] = useState<string | null>(worth?.detail ?? null);
  const [asking, setAsking] = useState<Asking>("idle");
  if (!on || !worth) return null;
  const shownDetail = detail ?? worth.detail ?? null;
  // The explanation's own phrase when it has one (older explanations have none), else the föremål's name.
  const phrase = phraseForSearch(shownDetail ? parseWorthDetail(shownDetail)?.search : null, name ?? "");

  async function explain() {
    if (!thingId || asking === "asking") return;
    setAsking("asking");
    const answer = await explainWorthDetail(thingId);
    if (answer.ok) {
      setDetail(answer.data.detail);
      setAsking("idle");
    } else {
      setAsking({ error: errorMessages[answer.error.code] ?? explainWorthFailedText });
    }
  }

  return (
    <section aria-label={worthTitleText} data-testid="worth-block" className="flex flex-col gap-2 rounded-lg bg-bg px-3.5 py-3">
      <p>
        <span className="inline-flex items-center gap-1 rounded-full bg-star-tint py-0.5 pr-2.5 pl-1.5 text-meta font-semibold text-star-ink">
          <StarIcon size={14} className="shrink-0" />
          {worthTitleText}
        </span>
      </p>
      <p className="text-body text-ink">{worth.why}</p>
      {shownDetail ? <WorthDetail text={shownDetail} /> : null}
      {!shownDetail && thingId ? (
        <div className="flex flex-col items-start gap-2">
          {asking === "asking" ? (
            <div role="status" data-testid="worth-explaining">
              <AiWorking size="sm" label={explainingWorthText} />
            </div>
          ) : (
            <Button variant="secondary" onClick={() => void explain()} data-testid="worth-explain">
              {explainWorthButtonText}
            </Button>
          )}
          {typeof asking === "object" ? <Notice role="alert">{asking.error}</Notice> : null}
        </div>
      ) : null}
      <SoldSearch phrase={phrase} />
      <p className="text-meta text-ink-2">
        <span data-testid="worth-confidence">{worthConfidenceText(worth.confidence)}</span>. {worthDisclaimerText}
      </p>
    </section>
  );
}
