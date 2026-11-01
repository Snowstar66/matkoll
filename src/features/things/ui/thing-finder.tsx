"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { searchDelayMs } from "@/components/search-field";
import { searchThingsAction } from "../actions/search-things";
import {
  hitCountText,
  maxHits,
  noHitsAskText,
  noHitsText,
  rankHits,
  searchFailedText,
  searchingText,
  minSearchChars,
  topHitsText,
  type ThingHit,
} from "../domain/thing-search";
import { RankedHits } from "./hit-rows";
import { ThingChat } from "./thing-chat";

// One field to search and ask (Story 18.17, joining Stories 18.4 and 18.14): on
// the Förråd tab, "Sök eller fråga …" under "Ta kort". From two characters the
// database's matches show under it as you type (typos are fine, no AI, nothing
// loaded up front); ↑ or Enter sends the text to the chat. While the matches
// show they replace the rooms (`children`, which stay mounted underneath), and
// they are hidden while a conversation is going on.

type Found = { query: string; hits: ThingHit[] | "failed" };

function Hits({ query, siteId }: { query: string; siteId?: string }) {
  const [found, setFound] = useState<Found | null>(null);
  useEffect(() => {
    if (query.length < minSearchChars) return;
    let current = true;
    searchThingsAction(query)
      .then((result) => current && setFound({ query, hits: result.ok ? result.data.hits : "failed" }))
      .catch(() => current && setFound({ query, hits: "failed" }));
    return () => {
      current = false;
    };
  }, [query]);
  // The hits of an earlier text stay until the new ones arrive, so the list does not flash empty.
  const shown = useMemo(() => found?.hits ?? null, [found]);
  const ranked = useMemo(() => rankHits(found?.query ?? query, Array.isArray(shown) ? shown : []), [found, query, shown]);
  if (shown === null) return <p className="px-1 text-body text-ink-2">{searchingText}</p>;
  if (shown === "failed") return <p className="px-1 text-body text-ink-2" role="alert">{searchFailedText}</p>;
  if (shown.length === 0) {
    return (
      // Story 18.19: ↑ also saves where something is (the help line).
      <EmptyState hint={noHitsAskText} className="py-6">
        {noHitsText(query)}
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-2" data-testid="thing-hits" aria-busy={found?.query !== query || undefined}>
      <p className="sr-only" role="status">
        {hitCountText(shown.length)}
      </p>
      {/* Story 18.19: the hits whose name holds the text are the answer; the close ones are "Liknande". */}
      <RankedHits best={ranked.best} similar={ranked.similar} siteId={siteId} label="Sökträffar" key={query} />
      {shown.length >= maxHits ? <p className="px-1 text-meta text-ink-2">{topHitsText(shown.length)}</p> : null}
    </div>
  );
}

export function ThingFinder({ children, siteId, rooms }: { children: ReactNode; siteId?: string; rooms?: readonly string[] }) {
  const [text, setText] = useState("");
  const [talking, setTalking] = useState(false);
  const [query, setQuery] = useState("");
  const trimmed = text.trim();
  // The database is asked for when typing stops, from two characters, and not while a conversation is going on.
  const searching = trimmed.length >= minSearchChars && !talking;
  useEffect(() => {
    const timer = setTimeout(() => setQuery(trimmed), trimmed === "" ? 0 : searchDelayMs);
    return () => clearTimeout(timer);
  }, [trimmed]);
  return (
    <div className="flex flex-col gap-4">
      {/* Mounted all the time, so the conversation is still there when the text is cleared. */}
      <ThingChat onTextChange={setText} onConversationChange={setTalking} siteId={siteId} rooms={rooms} />
      {searching ? <Hits query={query} siteId={siteId} /> : null}
      {/* The places stay mounted while the hits show, so a boende switch or a sheet keeps its state. */}
      <div className={searching ? "hidden" : undefined}>{children}</div>
    </div>
  );
}
