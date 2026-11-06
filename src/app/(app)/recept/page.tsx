import type { Metadata } from "next";
import { RecipesView } from "./recipes-view";

export const metadata: Metadata = { title: "Recept" };

// "Nya idéer med extrapris" are prepared by a Server Action from this page (offers fetched, or the first
// view of a week), whose after() holds the AI run: it lives as long as this page's maxDuration allows (the
// model gets 100 s of it, as /api/ai/jobs has 300 s).
export const maxDuration = 300;

// Receptbiblioteket; the page itself is in recipes-view.tsx, shared with /recept/importera.
// "?filter=erbjudanden" (from "Visa alla" in Veckans erbjudanden) opens it with the filter Erbjudanden.
export default function RecipesPage({ searchParams }: PageProps<"/recept">) {
  const initialFilter = searchParams.then(({ filter }) => (filter === "erbjudanden" ? ("offers" as const) : undefined));
  return <RecipesView initialFilter={initialFilter} />;
}
