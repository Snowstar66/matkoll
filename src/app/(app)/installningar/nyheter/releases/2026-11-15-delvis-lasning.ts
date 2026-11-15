import type { Release } from "../release";

export const release: Release = {
  date: "2026-11-15",
  title: "En meny som avbryts sent behåller rätterna som kommit",
  bullets: [
    "Avbryts läsningen av en stor meny sent, till exempel av tidsgränsen, behåller appen de rätter som redan lästs in i stället för att visa att nätet saknas.",
    "Överst står hur många rätter det blev, med knappen Läs om som läser samma foton igen. Några rätter kan saknas, så kolla mot menyn.",
    "En läsning som avbryts före de första rätterna visar fortfarande felsidan som förut.",
  ],
};
