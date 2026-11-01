"use client";

import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAiJobs } from "@/lib/ai-jobs-client";
import { locateThingCards } from "../actions/locate-cards";
import { isUnseenThingJob, jobCardId, maxLocatedCards, newCardsText, type CardWhere } from "../domain/thing-news";

// The Förråd tab's badge told on the overview (Pontus 1 Nov, "en etta på
// Förråd men inget nytt"): the room whose card was read and not yet seen says
// "1 nytt kort" with a small accent dot; opening the room clears it, as before.
// The cards of the unseen readings are looked up once (where they are now, so
// a card moved with its room is still found). A reading that failed, or whose
// card is gone (removed, replaced by Ta om, its room cleared), is marked seen
// here, so the badge never stays with nothing to open.

const RoomNewsContext = createContext<Readonly<Record<string, number>>>({});

export function RoomNews({ siteId, children }: { siteId: string; children: ReactNode }) {
  const { jobs, loaded, markSeen } = useAiJobs();
  // Where each asked card is now; null for a card that is gone.
  const [where, setWhere] = useState<Readonly<Record<string, CardWhere | null>>>({});
  const asked = useRef(new Set<string>());

  useEffect(() => {
    if (!loaded) return;
    const ask: string[] = [];
    for (const job of jobs) {
      if (!isUnseenThingJob(job)) continue;
      const card = jobCardId(job);
      if (job.status === "failed" || card === null || where[card] === null) {
        void markSeen(job.id);
        continue;
      }
      if (!(card in where) && !asked.current.has(card)) {
        asked.current.add(card);
        ask.push(card);
      }
    }
    for (let start = 0; start < ask.length; start += maxLocatedCards) {
      const chunk = ask.slice(start, start + maxLocatedCards);
      // A lookup that does not go is asked again the next time the jobs change.
      const forget = () => chunk.forEach((id) => asked.current.delete(id));
      locateThingCards(chunk)
        .then((result) => {
          if (!result.ok) return forget();
          setWhere((all) => Object.fromEntries([...Object.entries(all), ...chunk.map((id) => [id, result.data.find((card) => card.id === id) ?? null])]));
        })
        .catch(forget);
    }
  }, [jobs, loaded, where, markSeen]);

  const counts = useMemo(() => {
    const byRoom: Record<string, number> = {};
    for (const job of jobs) {
      if (!isUnseenThingJob(job) || job.status !== "done") continue;
      const card = jobCardId(job);
      const at = card ? where[card] : null;
      if (at && at.siteId === siteId) byRoom[at.roomKey] = (byRoom[at.roomKey] ?? 0) + 1;
    }
    return byRoom;
  }, [jobs, where, siteId]);

  return <RoomNewsContext.Provider value={counts}>{children}</RoomNewsContext.Provider>;
}

/** A room row's line on the overview: "• 1 nytt kort · 74 föremål · 9 kort · 31 okt" while the room has an unseen card, else the line as it is. */
const noSubscription = () => () => {};

export function RoomMeta({ roomKey, text }: { roomKey: string; text: string }) {
  const count = useContext(RoomNewsContext)[roomKey] ?? 0;
  // The rows are rendered on the server without the news (the jobs are the browser's), so it is added after hydration.
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false);
  if (count === 0 || !hydrated) return text;
  return (
    <>
      <span className="font-medium text-accent" data-testid="room-news">
        <span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full bg-accent align-[1px]" />
        {newCardsText(count)}
      </span>
      {text ? ` · ${text}` : null}
    </>
  );
}
