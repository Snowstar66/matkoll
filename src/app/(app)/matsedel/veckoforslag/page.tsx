import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import { weekNumber, weekParam, weekQueryAlways } from "@/features/mealplan";
import { getMealPlanView, resolveViewedWeek } from "@/features/mealplan/server";
import { listStores } from "@/features/settings/server";
import { getAgentPlacedDays, getWeekAgentSettings, getWeekDraft } from "@/features/week-agent/server";
import { MatsedelProposal } from "../week-agent-slots";

export const metadata: Metadata = { title: "Veckoförslag" };

// Maximum for the model run behind "Föreslå veckan" (the proposal is made by a Server Action called from this page).
export const maxDuration = 300;

// Veckoförslag (Veckoagenten, Tillval, off by default): the week's dinners with a reason per day, from the card or the
// ⋯ in Matsedel. The week is in the address as in Matsedel (?vecka=2026-W47). A draft that was made earlier is shown;
// without one, a proposal is made on arrival only when the address says the user asked for it (?starta=1 from the
// card, ?gor-om=1 from the ⋯ on a full week: the days the agent filled); a plain visit never costs anything. Nothing is saved in Matsedel before "Använd veckan".
export default function ProposalPage({ searchParams }: PageProps<"/matsedel/veckoforslag">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Förslag" backHref="/matsedel" backLabel="Matsedel" />
          <Skeleton rows={4} />
        </>
      }
    >
      <Proposal searchParams={searchParams} />
    </Suspense>
  );
}

async function Proposal({ searchParams }: { searchParams: Promise<{ vecka?: string | string[]; starta?: string | string[]; "gor-om"?: string | string[] }> }) {
  await requireUserOrRedirect("/matsedel/veckoforslag");
  const params = await searchParams;
  const vecka = Array.isArray(params.vecka) ? params.vecka[0] : params.vecka;
  const startFlag = (Array.isArray(params.starta) ? params.starta[0] : params.starta) === "1";
  const redoFlag = (Array.isArray(params["gor-om"]) ? params["gor-om"][0] : params["gor-om"]) === "1";
  const weekStart = await resolveViewedWeek(vecka);
  const week = weekNumber(weekStart);
  const backHref = `/matsedel${weekQueryAlways(weekStart)}`;

  const [view, draft, settings, stores, agentDays] = await Promise.all([
    getMealPlanView(weekStart),
    getWeekDraft(weekStart),
    getWeekAgentSettings(),
    listStores().catch(() => []),
    redoFlag ? getAgentPlacedDays(weekStart) : Promise.resolve(null),
  ]);

  const filled = [...new Set(view.dishes.flatMap((dish) => (dish.weekday ? [dish.weekday] : [])))].sort((a, b) => a - b);
  // A redo asks for a new proposal even when a draft exists; it keeps what the household put there itself.
  const ownDays = redoFlag ? filled.filter((day) => !(agentDays ?? []).includes(day)) : null;
  const initialDraft = !redoFlag && draft ? { id: draft.id, proposal: draft.proposal, model: draft.model } : null;

  return (
    <MatsedelProposal
      weekStart={weekStart}
      weekNumber={week}
      backHref={backHref}
      address={`/matsedel/veckoforslag?vecka=${weekParam(weekStart)}`}
      initialDraft={initialDraft}
      autoStart={initialDraft === null && (startFlag || redoFlag)}
      ownDays={ownDays}
      settings={{ settings, stores: stores.map((store) => ({ id: store.id, name: store.name })) }}
    />
  );
}
