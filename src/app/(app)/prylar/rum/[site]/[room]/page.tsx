import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { PageHeader } from "@/components/app-shell/page-header";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import { normalizePlaceName, parseRoomView } from "@/features/things";
import { getRoomPage, listRooms, ThingsDataError } from "@/features/things/server";
import { RoomView } from "@/features/things/ui/room-view";
import { errorMessages } from "@/lib/errors";
import { WarmAi } from "../../../../warm-ai";

export const metadata: Metadata = { title: "Förråd" };

// A room in Förråd (Epic 18, Story 18.12), at /prylar/rum/<boende>/<room>: the
// summary, "Ta fler kort", and Prylar or Kort. The room is the distinct room of
// the boende's places (its key is in the address). An id that is not a uuid, or a
// room the user does not have, is "Sidan finns inte." The address and the
// session are read inside <Suspense> (AD-18).
export default function RoomPage({ params, searchParams }: PageProps<"/prylar/rum/[site]/[room]">) {
  return (
    <>
      <WarmAi kind="image" />
      <Suspense
        fallback={
          <>
            <PageHeader title="Förråd" backHref="/prylar" backLabel="Förråd" />
            <Skeleton rows={3} />
          </>
        }
      >
        <RoomContent params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

async function RoomContent({ params, searchParams }: Pick<PageProps<"/prylar/rum/[site]/[room]">, "params" | "searchParams">) {
  const { site, room } = await params;
  const { fota, vy } = await searchParams;
  await requireUserOrRedirect(`/prylar/rum/${encodeURIComponent(site)}/${encodeURIComponent(room)}`);
  if (!z.uuid().safeParse(site).success) notFound();
  const key = normalizePlaceName(decode(room));

  let page;
  let rooms: string[];
  try {
    page = await getRoomPage(site, key);
    if (!page) notFound();
    rooms = (await listRooms(site)).map((entry) => entry.room);
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
    return (
      <>
        <PageHeader title="Förråd" backHref="/prylar" backLabel="Förråd" />
        <Notice role="alert">{errorMessages.things_unavailable}</Notice>
      </>
    );
  }

  const { summary, categories, cards, places } = page;
  const parent = places.find((place) => place.kind === "part" && place.part === null) ?? places.find((place) => place.kind === "part") ?? null;
  const box = typeof fota === "string" ? places.find((place) => place.id === fota && place.kind === "box") : undefined;
  return (
    <>
      <PageHeader title={summary.room} backHref="/prylar" backLabel="Förråd" />
      <RoomView
        siteId={site}
        summary={summary}
        categories={categories}
        cards={cards}
        rooms={rooms}
        boxParent={parent?.id ?? null}
        photographBox={box && box.part ? { id: box.id, name: box.part } : null}
        initialView={parseRoomView(typeof vy === "string" ? vy : null)}
        placeIds={places.map((place) => place.id)}
      />
    </>
  );
}
