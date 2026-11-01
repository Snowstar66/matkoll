import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUserOrRedirect } from "@/features/auth/server";
import { replayReturnPath, welcomeRoute } from "@/features/welcome";
import { ReplayTour } from "./replay-tour";

export const metadata: Metadata = { title: "Välkommen" };

// The welcome tour, played again (Story 20.1): "Så funkar Livskoll" in Hjälp och tips links here with
// `?fran=hjalp`, and Hoppa över (or Esc) goes back there; without it, to Recept. The choices on the
// last page lead on as after the first login. The tour itself is the same one; it is shown after
// login by WelcomeGate in the layout, not from here.
export default function WelcomePage({ searchParams }: PageProps<"/valkomst">) {
  return (
    <Suspense fallback={null}>
      <Replay searchParams={searchParams} />
    </Suspense>
  );
}

async function Replay({ searchParams }: Pick<PageProps<"/valkomst">, "searchParams">) {
  const { fran } = await searchParams;
  const returnTo = replayReturnPath(fran);
  await requireUserOrRedirect(returnTo === "/hjalp" ? `${welcomeRoute}?fran=hjalp` : welcomeRoute);
  return <ReplayTour returnTo={returnTo} />;
}
