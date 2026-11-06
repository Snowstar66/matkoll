import type { Metadata } from "next";
import { RecipesView } from "./recipes-view";

export const metadata: Metadata = { title: "Recept" };

// Receptbiblioteket; the page itself is in recipes-view.tsx, shared with /recept/importera.
// "?filter=erbjudanden" (from "Visa alla" in Veckans erbjudanden) opens it with the filter Erbjudanden.
export default async function RecipesPage({ searchParams }: PageProps<"/recept">) {
  const { filter } = await searchParams;
  return <RecipesView initialFilter={filter === "erbjudanden" ? "offers" : undefined} />;
}
