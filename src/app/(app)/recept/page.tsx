import type { Metadata } from "next";
import { RecipesView } from "./recipes-view";

export const metadata: Metadata = { title: "Recept" };

// Receptbiblioteket; the page itself is in recipes-view.tsx, shared with /recept/importera.
export default function RecipesPage() {
  return <RecipesView />;
}
