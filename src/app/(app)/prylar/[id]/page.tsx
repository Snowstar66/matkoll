import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { PageHeader } from "@/components/app-shell/page-header";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import { placeTitle } from "@/features/things";
import { getPlaceView, getThingPlace, ThingsDataError } from "@/features/things/server";
import { CardPanel } from "@/features/things/ui/card-panel";
import { PlaceCapture } from "@/features/things/ui/place-capture";
import { errorMessages } from "@/lib/errors";
import { WarmAi } from "../../warm-ai";

export const metadata: Metadata = { title: "Prylar" };

// A place in Prylar (Epic 18, Story 18.2): the camera button, the place's
// latest card with its thumbnail and date, the things under their categories
// and the line about what is not visible. While a card is being read it says
// so and the page reads itself again; a card whose reading did not go stays
// with "Försök igen". An id that is not a uuid, or not one of the user's
// places, is "Sidan finns inte." The id and the session are read inside
// <Suspense> (AD-18).
export default function PlacePage({ params }: PageProps<"/prylar/[id]">) {
  return (
    <>
      <WarmAi kind="image" />
      <Suspense
        fallback={
          <>
            <PageHeader title="Prylar" backHref="/prylar" />
            <Skeleton rows={3} />
          </>
        }
      >
        <PlaceContent params={params} />
      </Suspense>
    </>
  );
}

async function PlaceContent({ params }: Pick<PageProps<"/prylar/[id]">, "params">) {
  const { id } = await params;
  await requireUserOrRedirect(`/prylar/${encodeURIComponent(id)}`);
  if (!z.uuid().safeParse(id).success) notFound();

  let place;
  let view;
  try {
    place = await getThingPlace(id);
    if (!place) notFound();
    view = await getPlaceView(id);
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
    return (
      <>
        <PageHeader title="Prylar" backHref="/prylar" />
        <Notice role="alert">{errorMessages.things_unavailable}</Notice>
      </>
    );
  }

  const { card, things, pending } = view;
  return (
    <>
      <PageHeader title={placeTitle(place)} backHref="/prylar" />
      <div className="flex flex-col gap-6">
        <PlaceCapture
          placeId={place.id}
          latestTakenAt={card?.takenAt ?? null}
          pending={pending && pending.status !== "done" ? { id: pending.id, status: pending.status, errorCode: pending.errorCode } : null}
        />
        {card ? <CardPanel card={card} things={things} /> : null}
      </div>
    </>
  );
}
