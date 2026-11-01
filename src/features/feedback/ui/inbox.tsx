"use client";

import { useState } from "react";
import { Avatar } from "@/components/app-shell/avatar";
import { Chip, ChipRow } from "@/components/chip";
import { cx } from "@/components/cx";
import { EmptyState } from "@/components/empty-state";
import { ListGroup } from "@/components/list-group";
import { Sheet } from "@/components/sheet";
import { accountOf } from "@/features/auth";
import { markFeedbackRead } from "../actions/mark-feedback-read";
import {
  type FeedbackItem,
  type FeedbackKind,
  averageCaption,
  averageRating,
  averageText,
  feedbackKinds,
  kindCounts,
  kindLabels,
  kindLine,
  receivedText,
  starWord,
} from "../domain/feedback";
import { StarsRow } from "./feedback-icons";

const sectionLabel = "mx-1 mt-6 mb-2 text-section-label text-ink-2";

/**
 * Inkorg (Story 20.3), only for the app's owner: the average rating at the top, chips
 * Förslag · Betyg · Fel with their counts (none chosen = all), and the messages under Nya
 * and Tidigare. A tap shows the whole text, the page and the app version, and marks the
 * message read. No replies in the first version (Beslut 9). `now` comes from the server,
 * so the times read the same on both sides.
 */
export function Inbox({ items, now }: { items: readonly FeedbackItem[]; now: string }) {
  const [filter, setFilter] = useState<FeedbackKind | null>(null);
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const at = new Date(now);

  const isRead = (item: FeedbackItem) => item.readAt !== null || readIds.has(item.id);
  const counts = kindCounts(items);
  const shown = filter ? items.filter((item) => item.kind === filter) : items;
  const fresh = shown.filter((item) => !isRead(item));
  const earlier = shown.filter(isRead);
  const rating = averageRating(items, at);
  const open = items.find((item) => item.id === openId) ?? null;

  async function show(item: FeedbackItem) {
    setOpenId(item.id);
    setError(null);
    if (isRead(item)) return;
    setReadIds((ids) => new Set(ids).add(item.id));
    const result = await markFeedbackRead(item.id);
    if (!result.ok) {
      setReadIds((ids) => {
        const next = new Set(ids);
        next.delete(item.id);
        return next;
      });
      setError(result.error.message);
    }
  }

  if (items.length === 0) {
    return <EmptyState title="Inkorgen är tom.">Förslag, betyg och fel som skickas från Hjälp hamnar här.</EmptyState>;
  }

  return (
    <div className="pb-4">
      <div className="mt-3 flex items-center gap-3.5 rounded-lg bg-surface px-4 py-3.5" data-testid="inbox-average">
        <span className="text-[28px] leading-8 font-semibold tracking-[-0.4px] text-ink">{rating ? averageText(rating.average) : "–"}</span>
        <span className="min-w-0">
          {rating ? <StarsRow stars={Math.round(rating.average)} /> : null}
          <small className="block text-[14px] leading-5 text-ink-2">
            {rating ? averageCaption(rating.count) : "Inga betyg de senaste 30 dagarna"}
          </small>
        </span>
      </div>
      <div className="mt-1.5">
        <ChipRow role="group" aria-label="Visa">
          {feedbackKinds.map((kind) => (
            <Chip
              key={kind}
              selected={filter === kind}
              aria-pressed={filter === kind}
              aria-label={`${kindLabels[kind]} ${counts[kind]}`}
              count={counts[kind]}
              onClick={() => setFilter(filter === kind ? null : kind)}
            >
              {kindLabels[kind]}
            </Chip>
          ))}
        </ChipRow>
      </div>
      {fresh.length > 0 ? <MessageGroup title="Nya" items={fresh} isRead={isRead} now={at} onOpen={show} /> : null}
      {earlier.length > 0 ? <MessageGroup title="Tidigare" items={earlier} isRead={isRead} now={at} onOpen={show} /> : null}
      {shown.length === 0 && filter ? <EmptyState>Inga {kindLabels[filter].toLowerCase()} än.</EmptyState> : null}
      <MessageSheet item={open} now={at} error={error} onClose={() => setOpenId(null)} />
    </div>
  );
}

function MessageGroup({
  title,
  items,
  isRead,
  now,
  onOpen,
}: {
  title: string;
  items: readonly FeedbackItem[];
  isRead: (item: FeedbackItem) => boolean;
  now: Date;
  onOpen: (item: FeedbackItem) => void;
}) {
  const id = `inkorg-${title.toLowerCase()}`;
  return (
    <section>
      <h2 id={id} className={sectionLabel}>
        {title}
      </h2>
      <ListGroup labelledBy={id} inset={60}>
        {items.map((item) => (
          <li key={item.id}>
            <MessageRow item={item} read={isRead(item)} now={now} onOpen={() => onOpen(item)} />
          </li>
        ))}
      </ListGroup>
    </section>
  );
}

function KindLine({ item }: { item: FeedbackItem }) {
  const line = kindLine(item);
  return (
    <span className="block text-[14px] leading-5 text-ink-3">
      {line ?? (
        <>
          Betyg <StarsRow stars={item.stars ?? 0} />
          <span className="sr-only">
            {" "}
            {item.stars} av 5, {starWord(item.stars ?? 0)}
          </span>
        </>
      )}
    </span>
  );
}

function MessageRow({ item, read, now, onOpen }: { item: FeedbackItem; read: boolean; now: Date; onOpen: () => void }) {
  const sender = accountOf(item.senderEmail || "?");
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="inbox-message"
      data-read={read}
      className="flex w-full gap-3 py-3 pr-4 pl-3 text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
    >
      <Avatar initial={sender.initial} size={36} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[17px] leading-[22px] font-medium text-ink">
            {read ? null : (
              <>
                <span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full bg-accent align-[2px]" />
                <span className="sr-only">Ny: </span>
              </>
            )}
            {sender.name}
          </span>
          <time dateTime={item.createdAt} className="text-[14px] whitespace-nowrap text-ink-3">
            {receivedText(item.createdAt, now)}
          </time>
        </span>
        <KindLine item={item} />
        {item.body ? (
          <span className={cx("mt-0.5 line-clamp-2 block text-[15px] leading-[21px] wrap-break-word", read ? "text-ink-2" : "text-ink")}>{item.body}</span>
        ) : null}
      </span>
    </button>
  );
}

/** One message in full: who and when, the stars, the whole text, the page and the app version. */
function MessageSheet({ item, now, error, onClose }: { item: FeedbackItem | null; now: Date; error: string | null; onClose: () => void }) {
  const sender = item ? accountOf(item.senderEmail || "?") : null;
  return (
    <Sheet open={item !== null} onClose={onClose} title={sender?.name ?? ""} closeLabel="Klar" initialFocus="title">
      {item && sender ? (
        <div className="flex flex-col gap-3 pb-2">
          <div>
            <KindLine item={item} />
            <p className="text-[14px] leading-5 text-ink-3">
              {sender.email} · {receivedText(item.createdAt, now)}
            </p>
          </div>
          {item.body ? <p className="text-body whitespace-pre-wrap text-ink wrap-break-word">{item.body}</p> : null}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[15px] leading-[21px]">
            <dt className="text-ink-2">Sidan</dt>
            <dd className="text-ink break-all">{item.page ?? "–"}</dd>
            <dt className="text-ink-2">Version</dt>
            <dd className="text-ink">{item.appVersion ?? "–"}</dd>
          </dl>
          {error ? (
            <p role="alert" className="text-meta text-sky-ink">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
