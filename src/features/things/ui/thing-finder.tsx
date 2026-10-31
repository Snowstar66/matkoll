"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { cx } from "@/components/cx";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { searchDelayMs } from "@/components/search-field";
import { searchThingsAction } from "../actions/search-things";
import {
  hitCountText,
  hitHref,
  hitMeta,
  hitTile,
  maxHits,
  noHitsText,
  searchFailedText,
  searchingText,
  minSearchChars,
  topHitsText,
  type ThingHit,
} from "../domain/thing-search";
import { ThingChat } from "./thing-chat";

// One field to search and ask (Story 18.17, joining Stories 18.4 and 18.14): on
// the Förråd tab, "Sök eller fråga …" under "Ta kort". From two characters the
// database's matches show under it as you type (typos are fine, no AI, nothing
// loaded up front); ↑ or Enter sends the text to the chat. While the matches
// show they replace the rooms (`children`, which stay mounted underneath), and
// they are hidden while a conversation is going on.

type Found = { query: string; hits: ThingHit[] | "failed" };

function Hits({ query }: { query: string }) {
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
  if (shown === null) return <p className="px-1 text-body text-ink-2">{searchingText}</p>;
  if (shown === "failed") return <p className="px-1 text-body text-ink-2" role="alert">{searchFailedText}</p>;
  if (shown.length === 0) return <p className="px-1 text-body text-ink-2">{noHitsText(query)}</p>;
  return (
    <div className="flex flex-col gap-2" data-testid="thing-hits" aria-busy={found?.query !== query || undefined}>
      <p className="sr-only" role="status">
        {hitCountText(shown.length)}
      </p>
      <ListGroup label="Sökträffar">
        {shown.map((hit) => {
          const { icon, tile } = hitTile(hit);
          return (
            <ListRow
              key={hit.id}
              href={hitHref(hit)}
              title={hit.name}
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
      {shown.length >= maxHits ? <p className="px-1 text-meta text-ink-2">{topHitsText(shown.length)}</p> : null}
    </div>
  );
}

export function ThingFinder({ children }: { children: ReactNode }) {
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
      <ThingChat onTextChange={setText} onConversationChange={setTalking} />
      {searching ? <Hits query={query} /> : null}
      {/* The places stay mounted while the hits show, so a boende switch or a sheet keeps its state. */}
      <div className={searching ? "hidden" : undefined}>{children}</div>
    </div>
  );
}
