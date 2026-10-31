import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import { normalizePlaceName } from "@/features/things";
import { getThingPlace, ThingsDataError } from "@/features/things/server";

// An old place address, /prylar/<place> (Stories 18.1 to 18.10), still works
// since search hits, answers and bookmarks point at it: it opens the room the
// place is in (Story 18.12). A place that is gone, or is not the user's, is
// "Sidan finns inte." The id and the session are read inside <Suspense> (AD-18).
export default function PlacePage({ params, searchParams }: PageProps<"/prylar/[id]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Förråd" backHref="/prylar" backLabel="Förråd" />
          <Skeleton rows={3} />
        </>
      }
    >
      <PlaceRedirect params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PlaceRedirect({ params, searchParams }: Pick<PageProps<"/prylar/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const { fota } = await searchParams;
  await requireUserOrRedirect(`/prylar/${encodeURIComponent(id)}`);
  if (!z.uuid().safeParse(id).success) notFound();

  let place;
  try {
    place = await getThingPlace(id);
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
    throw error;
  }
  if (!place) notFound();
  const room = `/prylar/rum/${place.siteId}/${encodeURIComponent(normalizePlaceName(place.room))}`;
  // A box's old camera link (`?fota=1`) offers its camera in the room.
  return redirect(place.isBox && fota ? `${room}?fota=${place.id}` : room);
}
