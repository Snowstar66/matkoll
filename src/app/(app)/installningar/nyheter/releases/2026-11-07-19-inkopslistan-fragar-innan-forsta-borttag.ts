import type { Release } from "../release";

export const release: Release = {
  date: "2026-11-07",
  title: "Inköpslistan frågar innan första borttagningen",
  bullets: [
    "Första gången du tar bort en vara från Inköpslistan, med soptunnan, svepet eller Ta bort på varan, frågar listan om du vill ta bort den.",
    "Efter ditt Ta bort går nästa borttagningar direkt i en minut, och Ångra finns kvar efter varje.",
    "Har du inte tagit bort något på en minut frågar listan igen. Övriga sidor frågar inte.",
  ],
};
