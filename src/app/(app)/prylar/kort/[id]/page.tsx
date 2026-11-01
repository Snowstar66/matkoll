import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { PageHeader } from "@/components/app-shell/page-header";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import { cardViewMeta, cardViewTitle } from "@/features/things";
import { getCardView, ThingsDataError } from "@/features/things/server";
import { CardView } from "@/features/things/ui/card-view";
import { errorMessages } from "@/lib/errors";

export const metadata: Metadata = { title: "Förråd" };

// "Lägg till föremål" saves in a Server Action on this page (Story 18.15): one
// short call to the model, which gets at most 25 s of this.
export const maxDuration = 60;

// A card in its big view, at /prylar/kort/<card> (Story 18.7): the whole photo
// with a box round each föremål, and the föremål under it. `?foremal=<id>`
// (from a search hit or the chat) opens it with that föremål marked. "Tillbaka"
// goes back where Pontus came from, or to the room's cards. An id that is not a
// uuid, or a card the user does not have, is "Sidan finns inte." The address
// and the session are read inside <Suspense> (AD-18).
export default function CardPage({ params, searchParams }: PageProps<"/prylar/kort/[id]">) {
  return (
    <div data-wide-frame className="flex flex-1 flex-col">
      <Suspense
        fallback={
          <>
            <PageHeader title="Kort" backHref="/prylar" backInHistory />
            <Skeleton rows={3} />
          </>
        }
      >
        <CardContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CardContent({ params, searchParams }: Pick<PageProps<"/prylar/kort/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const { foremal } = await searchParams;
  await requireUserOrRedirect(`/prylar/kort/${encodeURIComponent(id)}`);
  if (!z.uuid().safeParse(id).success) notFound();

  let card;
  try {
    card = await getCardView(id);
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
    return (
      <>
        <PageHeader title="Kort" backHref="/prylar" backInHistory />
        <Notice role="alert">{errorMessages.things_unavailable}</Notice>
      </>
    );
  }
  if (!card) notFound();

  const roomHref = `/prylar/rum/${card.siteId}/${encodeURIComponent(card.roomKey)}`;
  const marked = typeof foremal === "string" && z.uuid().safeParse(foremal).success ? foremal : null;
  return (
    <>
      <PageHeader title={cardViewTitle(card)} backHref={`${roomHref}?vy=cards`} backInHistory />
      <p className="-mt-3 mb-3 px-px text-meta text-ink-2" data-testid="card-meta">
        {cardViewMeta(card)}
      </p>
      <CardView card={card} initialThingId={marked} roomHref={roomHref} />
    </>
  );
}
