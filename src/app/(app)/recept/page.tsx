import type { Metadata } from "next";
import { RecipesView } from "./recipes-view";

export const metadata: Metadata = { title: "Recept" };

// Receptbiblioteket; the page itself is in recipes-view.tsx, shared with /recept/importera.
// "?filter=erbjudanden" (from "Visa alla" in Veckans erbjudanden) opens it with the filter Erbjudanden.
export default function RecipesPage({ searchParams }: PageProps<"/recept">) {
  const initialFilter = searchParams.then(({ filter }) => (filter === "erbjudanden" ? ("offers" as const) : undefined));
  return <RecipesView initialFilter={initialFilter} />;
}
