import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { PageHeader } from "@/components/app-shell/page-header";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import { normalizePlaceName, writtenToText } from "@/features/things";
import { getBoxPage, ThingsDataError } from "@/features/things/server";
import { BoxThings } from "@/features/things/ui/box-things";
import { errorMessages } from "@/lib/errors";

export const metadata: Metadata = { title: "Förråd" };

// "Skriv vad som finns" saves in a Server Action on this page (Story 18.13): one
// short call to the model, which gets at most 25 s of this.
export const maxDuration = 60;

// A box, at /prylar/lada/<place> (Epic 18, Story 18.13): what it holds, written
// by hand, and the way to photograph its inside instead (or as well). An id that
// is not a uuid, or a place that is gone, not the user's or not a box, is "Sidan
// finns inte." The address and the session are read inside <Suspense> (AD-18).
export default function BoxPage({ params }: PageProps<"/prylar/lada/[id]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Låda" backHref="/prylar" backLabel="Förråd" />
          <Skeleton rows={3} />
        </>
      }
    >
      <BoxContent params={params} />
    </Suspense>
  );
}

async function BoxContent({ params }: Pick<PageProps<"/prylar/lada/[id]">, "params">) {
  const { id } = await params;
  await requireUserOrRedirect(`/prylar/lada/${encodeURIComponent(id)}`);
  if (!z.uuid().safeParse(id).success) notFound();

  let box;
  try {
    box = await getBoxPage(id);
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
    return (
      <>
        <PageHeader title="Låda" backHref="/prylar" backLabel="Förråd" />
        <Notice role="alert">{errorMessages.things_unavailable}</Notice>
      </>
    );
  }
  if (!box) notFound();

  const { place } = box;
  const roomHref = `/prylar/rum/${place.siteId}/${encodeURIComponent(normalizePlaceName(place.room))}`;
  return (
    <>
      <PageHeader title={place.part ?? "Låda"} backHref={roomHref} backLabel={place.room} />
      <BoxThings
        placeId={place.id}
        room={place.room}
        roomHref={roomHref}
        initialText={writtenToText(box.written.map((thing) => thing.name))}
        photographed={box.photographed}
      />
    </>
  );
}
