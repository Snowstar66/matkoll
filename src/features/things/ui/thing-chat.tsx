"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { AiWorking } from "@/components/ai-working";
import { Button } from "@/components/button";
import { cx } from "@/components/cx";
import { Input } from "@/components/field";
import { Notice } from "@/components/notice";
import { errorMessages, fail, type AppError, type Result } from "@/lib/errors";
import { askChat, type ChatAnswer } from "../actions/ask-chat";
import {
  askButtonText,
  askHintText,
  askLabel,
  askPlaceholder,
  maxHistoryAnswerChars,
  maxHistoryTurns,
  maxQuestionChars,
  newQuestionText,
  type ChatRef,
} from "../domain/thing-ask";
import { notedSubText, rememberedText, type NotedProposal, type Remembered } from "../domain/thing-noted";
import type { ThingHit } from "../domain/thing-search";
import { RankedHits } from "./hit-rows";
import { NotedTile, RememberProposal } from "./remember-proposal";

// "Fråga om ditt förråd" as a chat (Story 18.14), at the top of Förråd under
// "Ta kort": a bubble for each question, an answer with cards to tap (room and
// part or box, the card's thumbnail and date), and a field for the next one. The
// conversation is kept here, in the browser, and not stored: a reload or "Ny
// fråga" clears it, and only the latest turns go with a question, so the AI
// understands "och tången då?". Story 18.19: a text that says where something
// is gets a proposal to remember it instead of an answer; once saved, the
// bubble says where it is, with a card to the room.

type Turn = {
  id: number;
  question: string;
  /** Undefined while the answer is on its way. */
  answer?: string;
  refs?: ChatRef[];
  error?: AppError;
  /** Story 18.19: a thing to remember, until it is saved. */
  proposal?: NotedProposal;
  /** Story 18.19: a plain search's answer from the database. */
  hits?: ThingHit[];
  similar?: ThingHit[];
};

function Reference({ reference }: { reference: ChatRef }) {
  return (
    <Link
      href={reference.href}
      data-testid="chat-ref"
      className="mt-2 flex min-h-tap items-center gap-2.5 rounded-md border border-border bg-surface p-1.5"
    >
      {reference.noted ? (
        <NotedTile className="h-10 w-13" />
      ) : reference.photoId ? (
        // The photo is served by the route that checks the user; nothing is fetched from anywhere else.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/things/photo/${reference.photoId}`} alt="" loading="lazy" className="h-10 w-13 shrink-0 rounded-sm bg-border object-cover" />
      ) : (
        <span aria-hidden="true" className="flex h-10 w-13 shrink-0 items-center justify-center rounded-sm bg-tile-clay text-tile-icon leading-none">
          {"\u{1F4E6}"}
        </span>
      )}
      <span className="flex min-w-0 flex-col">
        <span className="text-meta font-medium wrap-break-word text-ink">{reference.title}</span>
        <span className="text-meta text-ink-3">{reference.sub}</span>
      </span>
    </Link>
  );
}

export function ThingChat({
  onTextChange,
  onConversationChange,
  siteId,
  rooms = [],
}: {
  /** Story 18.19: the boende the page shows; a thing to remember is saved there. */
  siteId?: string;
  /** The boende's rooms, offered when a proposal is changed. */
  rooms?: readonly string[];
  /** Called with the field's text on every change (the instant search follows it). */
  onTextChange?: (text: string) => void;
  /** Called with whether a conversation is going on (the instant matches hide then). */
  onConversationChange?: (active: boolean) => void;
} = {}) {
  const ids = useId();
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const pending = turns.some((turn) => turn.answer === undefined && !turn.error);
  /** Counts the questions and "Ny fråga"s, so an answer to a cleared conversation is dropped. */
  const generation = useRef(0);
  const nextId = useRef(1);
  const lastTurn = useRef<HTMLDivElement>(null);

  const talking = turns.length > 0;
  useEffect(() => {
    onConversationChange?.(talking);
  }, [talking, onConversationChange]);

  function type(next: string) {
    setText(next);
    onTextChange?.(next);
  }

  useEffect(() => {
    // Not in every environment (jsdom has none).
    lastTurn.current?.scrollIntoView?.({ block: "nearest" });
  }, [turns]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = text.trim();
    if (pending || question === "") return;
    const history = turns
      .filter((turn) => turn.answer !== undefined)
      .slice(-maxHistoryTurns)
      .map((turn) => ({ question: turn.question, answer: (turn.answer ?? "").slice(0, maxHistoryAnswerChars) }));
    const id = nextId.current++;
    const mine = generation.current;
    setTurns((all) => [...all, { id, question }]);
    type("");
    let result: Result<ChatAnswer>;
    try {
      result = await askChat({ question, history, ...(siteId ? { siteId } : {}) });
    } catch {
      result = fail("ai_unavailable");
    }
    if (mine !== generation.current) return;
    setTurns((all) =>
      all.map((turn) =>
        turn.id !== id
          ? turn
          : result.ok
            ? { ...turn, answer: result.data.answer, refs: result.data.refs, proposal: result.data.proposal, hits: result.data.hits, similar: result.data.similar }
            : { ...turn, error: result.error },
      ),
    );
  }

  /** A proposal saved: the bubble says where it is, with the room to tap, and the counts are read again. */
  function saved(id: number, remembered: Remembered, name: string) {
    setTurns((all) =>
      all.map((turn) =>
        turn.id !== id
          ? turn
          : {
              ...turn,
              answer: rememberedText(name, remembered.title),
              proposal: undefined,
              refs: [{ href: remembered.href, photoId: null, title: remembered.title, sub: notedSubText(new Date(remembered.notedAt)), noted: true }],
            },
      ),
    );
    router.refresh();
  }

  function clear() {
    generation.current++;
    setTurns([]);
    type("");
  }

  return (
    <section aria-label={askLabel} className="flex flex-col gap-3 rounded-lg bg-surface p-3" data-testid="chat">
      {turns.length > 0 ? (
        <>
          <div role="log" aria-live="polite" aria-label="Samtalet" className="flex flex-col gap-2.5">
            {turns.map((turn, index) => (
              <div key={turn.id} ref={index === turns.length - 1 ? lastTurn : undefined} className="flex flex-col gap-2" data-testid="chat-turn">
                <div className="flex justify-end">
                  <p className="max-w-[80%] rounded-[1rem_1rem_0.25rem_1rem] bg-mint px-3 py-2 text-body wrap-break-word text-mint-ink" data-testid="chat-question">
                    {turn.question}
                  </p>
                </div>
                {turn.error ? (
                  <Notice role="alert">{turn.error.fields?.question ?? errorMessages[turn.error.code]}</Notice>
                ) : (
                  <div className="flex">
                    <div
                      className={cx("rounded-[1rem_1rem_1rem_0.25rem] bg-bg px-3 py-2.5 text-body text-ink", turn.hits || turn.similar ? "w-full" : "max-w-[88%]")}
                      data-testid="chat-answer"
                    >
                      {turn.answer === undefined ? (
                        <AiWorking size="sm" inLiveRegion />
                      ) : (
                        <>
                          <p className="wrap-break-word">{turn.answer}</p>
                          {turn.hits || turn.similar ? (
                            <div className="mt-2">
                              <RankedHits best={turn.hits ?? []} similar={turn.similar ?? []} siteId={siteId} label="Träffar" />
                            </div>
                          ) : null}
                          {turn.proposal && siteId ? (
                            <RememberProposal proposal={turn.proposal} siteId={siteId} rooms={rooms} onSaved={(remembered, name) => saved(turn.id, remembered, name)} />
                          ) : null}
                          {turn.refs?.map((reference) => <Reference key={reference.href + (reference.photoId ?? "")} reference={reference} />)}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button variant="compact" onClick={clear} data-testid="chat-clear">
              {newQuestionText}
            </Button>
          </div>
        </>
      ) : (
        text === "" ? <p className="px-1 text-meta text-ink-3">{askHintText}</p> : null
      )}
      <form onSubmit={submit} className="flex gap-2" aria-busy={pending || undefined}>
        <label htmlFor={`${ids}-q`} className="sr-only">
          {askLabel}
        </label>
        <Input
          id={`${ids}-q`}
          name="question"
          placeholder={askPlaceholder}
          autoComplete="off"
          enterKeyHint="send"
          maxLength={maxQuestionChars}
          value={text}
          onChange={(event) => type(event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-full border-transparent bg-bg"
        />
        <button
          type="submit"
          aria-label={askButtonText}
          aria-disabled={pending || undefined}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-row-title text-on-accent select-none aria-disabled:opacity-60"
        >
          <span aria-hidden="true">↑</span>
        </button>
      </form>
    </section>
  );
}
