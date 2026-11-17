import type { Release } from "../release";

export const release: Release = {
  date: "2026-11-17",
  title: "Kcal i listan stämmer med receptet",
  bullets: [
    "Ett recept kunde stå som \"kcal saknas\" i Recept och Matsedel fast receptsidan visade kcal. Listorna räknar nu likadant som receptsidan, så vitlök, örter och liknande som inte går att väga inte stoppar kcal.",
    "Det gäller också kcal-raden för veckan i Matsedel och chippet <500 kcal.",
  ],
};
