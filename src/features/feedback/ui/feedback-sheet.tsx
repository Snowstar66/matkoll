"use client";

import { type KeyboardEvent, useId, useRef, useState } from "react";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { cx } from "@/components/cx";
import { FieldLabel } from "@/components/field";
import { Sheet } from "@/components/sheet";
import { sendFeedback } from "../actions/send-feedback";
import {
  type FeedbackAreaId,
  type FeedbackSheetKind,
  feedbackAreas,
  maxFeedbackChars,
  ratingQuestion,
  sheetText,
  starWord,
  thanksText,
} from "../domain/feedback";
import { StarIcon, StarsRow, ThanksTile } from "./feedback-icons";

export type FeedbackSheetProps = {
  /** The sheet to show, or null when none is open. */
  kind: FeedbackSheetKind | null;
  onClose: () => void;
  /** The owner's first name ("Pontus"), or null when OWNER_EMAIL is not set. */
  ownerName: string | null;
  /** The area chosen when the sheet opens: the one the user came from. */
  area: FeedbackAreaId | null;
  /** Text to start with, e.g. the help search that found nothing. */
  initialText?: string;
  /** The page the user came from, sent along (e.g. /lista). */
  page: string | null;
};

type Phase = "form" | "sending" | "sent";

/** The field: several lines, grows with the text, 17 px; a 2 px accent line when focused (hjalp-valkomst.html). */
const textareaClasses = cx(
  "block w-full resize-none rounded-md border border-border bg-surface px-3.5 py-3 text-[17px] leading-6 text-ink [field-sizing:content] placeholder:text-ink-3",
  "max-h-[40dvh] outline-none focus:border-2 focus:border-accent focus:px-[13px] focus:py-[11px] dark:border-transparent dark:bg-fill dark:focus:border-accent",
);

/**
 * Tyck till (Story 20.3): Föreslå en funktion, Något som inte funkar? and Betygsätt
 * Livskoll as one sheet. The title is the thing, Avbryt at the top right, one field,
 * optional area chips chosen from where the user came, or five stars whose question
 * changes at 1–3; Skicka is dimmed until there is something to send. After sending,
 * the thanks and Klar. Opened only by the user (never by the app itself).
 */
export function FeedbackSheet({ kind, onClose, ownerName, area, initialText = "", page }: FeedbackSheetProps) {
  const ids = useId();
  const [openedAs, setOpenedAs] = useState<FeedbackSheetKind | null>(null);
  // What the sheet was opened with stays while it is open, even if the address changes under it.
  const [shown, setShown] = useState<FeedbackSheetKind>("idea");
  const [text, setText] = useState("");
  const [chosenArea, setChosenArea] = useState<FeedbackAreaId | null>(null);
  const [stars, setStars] = useState(0);
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  const thanksRef = useRef<HTMLHeadingElement>(null);

  // A new sheet each time it opens (the React way to reset state on a prop change).
  if (kind !== openedAs) {
    setOpenedAs(kind);
    if (kind) {
      setShown(kind);
      setText(kind === "rate" ? "" : initialText);
      setChosenArea(kind === "rate" ? null : area);
      setStars(0);
      setPhase("form");
      setError(null);
    }
  }

  const copy = sheetText(shown, ownerName);
  const body = text.trim();
  const canSend = shown === "rate" ? stars > 0 : body.length > 0;
  const dirty = phase !== "sent" && (shown === "rate" ? stars > 0 || body.length > 0 : body.length > 0 && body !== initialText.trim());

  async function send() {
    if (!canSend || phase !== "form") return;
    setPhase("sending");
    setError(null);
    const result = await sendFeedback(
      shown === "rate" ? { kind: "rating", stars, body: text, page } : { kind: shown, body: text, area: chosenArea, page },
    );
    if (result.ok) {
      setPhase("sent");
      requestAnimationFrame(() => thanksRef.current?.focus({ preventScroll: true }));
    } else {
      setPhase("form");
      setError(result.error.message);
    }
  }

  return (
    <Sheet
      open={kind !== null}
      onClose={onClose}
      title={copy.title}
      closeLabel={phase === "sent" ? "Klar" : "Avbryt"}
      isDirty={dirty}
      preventClose={phase === "sending"}
      footer={
        phase === "sent" ? undefined : (
          <>
            {error ? (
              <p role="alert" className="text-meta text-sky-ink">
                {error}
              </p>
            ) : null}
            <Button fullWidth disabled={!canSend || phase === "sending"} onClick={send} className="disabled:opacity-40" data-testid="feedback-send">
              {phase === "sending" ? "Skickar …" : "Skicka"}
            </Button>
          </>
        )
      }
    >
      {phase === "sent" ? (
        <div role="status" className="flex flex-col items-center px-2 pt-5 pb-9 text-center">
          {shown === "rate" ? <StarsRow stars={stars} size={30} gap="gap-1" /> : <ThanksTile />}
          <h3 ref={thanksRef} tabIndex={-1} className="mt-5 text-[22px] leading-7 font-semibold tracking-[-0.3px] text-ink outline-none">
            {shown === "rate" ? "Tack för ditt betyg." : `Tack! ${thanksText(ownerName)}`}
          </h3>
          <p className="mt-1.5 max-w-[290px] text-[16px] leading-6 text-ink-2">
            {shown === "rate"
              ? thanksText(ownerName)
              : shown === "idea"
                ? "Allt som skickas läses. Du kan föreslå något nytt när du vill."
                : "Allt som skickas läses. Sidan och appversionen kom med."}
          </p>
        </div>
      ) : shown === "rate" ? (
        <div className="pb-1">
          <p id={`${ids}-question`} className="mt-2 text-center text-[17px] leading-[22px] text-ink">
            {copy.question}
          </p>
          <StarPicker value={stars} onChange={setStars} labelledBy={`${ids}-question`} />
          <p aria-hidden="true" className="mt-0.5 min-h-5 text-center text-[15px] leading-5 text-ink-2">
            {starWord(stars)}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <FieldLabel htmlFor={`${ids}-text`} optional className="text-[15px] leading-5 font-medium">
              {ratingQuestion(stars)}
            </FieldLabel>
            <textarea
              id={`${ids}-text`}
              value={text}
              maxLength={maxFeedbackChars}
              placeholder="Skriv här"
              onChange={(event) => setText(event.target.value)}
              className={cx(textareaClasses, "min-h-24")}
            />
          </div>
        </div>
      ) : (
        <div className="pb-1">
          <div className="mt-2 flex flex-col gap-2">
            <FieldLabel htmlFor={`${ids}-text`} className="text-[15px] leading-5 font-medium">
              {copy.question}
            </FieldLabel>
            <textarea
              id={`${ids}-text`}
              value={text}
              maxLength={maxFeedbackChars}
              placeholder="Skriv här"
              onChange={(event) => setText(event.target.value)}
              className={cx(textareaClasses, "min-h-[120px]")}
            />
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <p id={`${ids}-area`} className="flex flex-wrap items-baseline gap-x-1.5 text-[15px] leading-5 font-medium text-ink">
              Gäller <span className="font-normal text-ink-2">(valfritt)</span>
            </p>
            <div role="group" aria-labelledby={`${ids}-area`} className="flex flex-wrap gap-2">
              {feedbackAreas.map((candidate) => (
                <Chip
                  key={candidate.id}
                  selected={chosenArea === candidate.id}
                  aria-pressed={chosenArea === candidate.id}
                  onClick={() => setChosenArea(chosenArea === candidate.id ? null : candidate.id)}
                >
                  {candidate.label}
                </Chip>
              ))}
            </div>
          </div>
          <p className="mt-3 text-[14px] leading-5 text-ink-2">{copy.hint}</p>
        </div>
      )}
    </Sheet>
  );
}

const arrowSteps: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };

/** Five stars as a radio group: 38 px stars in 52 px tap areas; the arrow keys move the choice. */
function StarPicker({ value, onChange, labelledBy }: { value: number; onChange: (stars: number) => void; labelledBy: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent) {
    const step = arrowSteps[event.key];
    let next: number | null = step === undefined ? null : Math.min(5, Math.max(1, (value || (step > 0 ? 0 : 6)) + step));
    if (event.key === "Home") next = 1;
    if (event.key === "End") next = 5;
    if (next === null) return;
    event.preventDefault();
    onChange(next);
    refs.current[next - 1]?.focus();
  }

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} onKeyDown={onKeyDown} className="mt-1 flex justify-center gap-1" data-testid="feedback-stars">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          ref={(element) => {
            refs.current[star - 1] = element;
          }}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} av 5, ${starWord(star)}`}
          tabIndex={value === star || (value === 0 && star === 1) ? 0 : -1}
          onClick={() => onChange(star)}
          className="flex size-[52px] items-center justify-center rounded-md outline-none focus-visible:outline-2 focus-visible:outline-accent"
        >
          <StarIcon on={star <= value} size={38} />
        </button>
      ))}
    </div>
  );
}
