"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/button";
import { cx } from "@/components/cx";
import { Input } from "@/components/field";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { Notice } from "@/components/notice";
import { SearchField } from "@/components/search-field";
import { errorMessages, fail, type AppError, type Result } from "@/lib/errors";
import { askAboutThings, type AskAnswer } from "../actions/ask-things";
import { askButtonText, askingText, askLabel, askPlaceholder, maxQuestionChars } from "../domain/thing-ask";
import {
  hitCountText,
  hitMeta,
  hitTile,
  moreHitsText,
  noHitsText,
  searchLabel,
  searchPlaceholder,
  searchThings,
  type IndexedPlace,
} from "../domain/thing-search";

// Sök och fråga (Story 18.4): on the Prylar tab, a search field over the
// things of every place and boende (plain text in the browser, no request and
// no AI) and the box "Fråga om ditt förråd", whose answer comes from the AI
// with places to tap. While the search has text its hits replace the places
// (`children`), which stay mounted underneath.

type Asked =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "answer"; answer: AskAnswer }
  | { kind: "error"; error: AppError };

function Hits({ places, query }: { places: readonly IndexedPlace[]; query: string }) {
  const { hits, total } = useMemo(() => searchThings(places, query), [places, query]);
  if (hits.length === 0) return <p className="px-1 text-body text-ink-2">{noHitsText(query)}</p>;
  return (
    <div className="flex flex-col gap-2" data-testid="thing-hits">
      <p className="sr-only" role="status">
        {hitCountText(total)}
      </p>
      <ListGroup label="Sökträffar">
        {hits.map((hit) => {
          const { icon, tile } = hitTile(hit);
          return (
            <ListRow
              key={hit.thing.id}
              href={`/prylar/${hit.place.id}`}
              title={hit.thing.name}
              meta={hitMeta(hit)}
              leading={
                <span
                  aria-hidden="true"
                  className={cx("flex size-tile shrink-0 items-center justify-center rounded-sm text-tile-icon leading-none select-none", tile)}
                >
                  {icon}
                </span>
              }
              pressProps={{ "data-testid": "thing-hit" }}
            />
          );
        })}
      </ListGroup>
      {total > hits.length ? <p className="px-1 text-meta text-ink-2">{moreHitsText(hits.length, total)}</p> : null}
    </div>
  );
}

function AskBox() {
  const ids = useId();
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<Asked>({ kind: "idle" });
  /** Counts the questions, so only the answer to the latest one is shown. */
  const latest = useRef(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (asked.kind === "asking" || question.trim() === "") return;
    const request = ++latest.current;
    setAsked({ kind: "asking" });
    let result: Result<AskAnswer>;
    try {
      result = await askAboutThings(question);
    } catch {
      result = fail("ai_unavailable");
    }
    if (request !== latest.current) return;
    setAsked(result.ok ? { kind: "answer", answer: result.data } : { kind: "error", error: result.error });
  }

  return (
    <section aria-labelledby={`${ids}-label`} className="flex flex-col gap-2" data-testid="ask-box">
      <h2 id={`${ids}-label`} className="px-1 text-section-label text-ink-2">
        {askLabel}
      </h2>
      <form onSubmit={submit} className="flex gap-2" aria-busy={asked.kind === "asking" || undefined}>
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
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="secondary" aria-disabled={asked.kind === "asking" || undefined}>
          {askButtonText}
        </Button>
      </form>
      {/* Mounted empty, so the text is announced when it appears. */}
      <div role="status" className="flex flex-col gap-2">
        {asked.kind === "asking" ? <p className="px-1 text-body text-ink-2">{askingText}</p> : null}
        {asked.kind === "answer" ? (
          <div className="flex flex-col gap-3 rounded-md bg-surface px-4 py-3" data-testid="ask-answer">
            <p className="text-body text-ink">{asked.answer.answer}</p>
            {asked.answer.refs.length > 0 ? (
              <ul className="flex flex-wrap gap-2" aria-label="Platser i svaret">
                {asked.answer.refs.map((ref) => (
                  <li key={ref.placeId}>
                    <Link
                      href={`/prylar/${ref.placeId}`}
                      data-testid="ask-ref"
                      className="inline-flex min-h-tap items-center rounded-full bg-sky px-4 text-meta font-semibold text-sky-ink"
                    >
                      {ref.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
      {asked.kind === "error" ? <Notice role="alert">{asked.error.fields?.question ?? errorMessages[asked.error.code]}</Notice> : null}
    </section>
  );
}

export function ThingFinder({ places, children }: { places: readonly IndexedPlace[]; children: ReactNode }) {
  const [query, setQuery] = useState("");
  const searching = query.trim() !== "";
  return (
    <div className="flex flex-col gap-4">
      <SearchField label={searchLabel} placeholder={searchPlaceholder} delayMs={0} maxLength={80} onSearch={setQuery} />
      {searching ? <Hits places={places} query={query} /> : null}
      {/* Mounted all the time, so an answer is still there when the search is cleared. */}
      <div className={searching ? "hidden" : undefined}>
        <AskBox />
      </div>
      {/* The places stay mounted while the hits show, so a boende switch or a sheet keeps its state. */}
      <div className={searching ? "hidden" : undefined}>{children}</div>
    </div>
  );
}
