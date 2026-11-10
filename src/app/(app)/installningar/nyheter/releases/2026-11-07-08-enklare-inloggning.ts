import type { Release } from "../release";

export const release: Release = {
  date: "2026-11-07",
  title: "Enklare inloggning",
  bullets: [
    "Inloggningssidan har tre delar: lösenord, inloggning utan lösenord och inbjudan. Det som inte behövs just nu ligger ihopfällt.",
    "Logga in utan lösenord heter nu Skicka länk och kod. Koden från mejlet visas när mejlet är skickat, med Skicka igen under.",
    "Har du fått en inbjudan? öppnar ett fält som tar både koden med 6 tecken och koden med 8 tecken, med eller utan mellanslag.",
  ],
};
