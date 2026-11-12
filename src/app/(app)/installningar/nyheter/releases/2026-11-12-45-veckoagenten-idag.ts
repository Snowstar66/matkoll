import type { Release } from "../release";

export const release: Release = {
  date: "2026-11-12",
  title: "Veckoagenten planerar från idag",
  bullets: [
    "Veckoagenten lägger inga middagar på dagar som redan har varit. Är det onsdag fyller den onsdag till söndag.",
    "Står det att veckan redan har lika många middagar som du ställt in räknas bara dagar som återstår.",
  ],
};
