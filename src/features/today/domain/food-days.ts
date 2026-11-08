import { addDays, easterSunday, nthWeekday, sameDay, type Day } from "./dates";

// Swedish food days that are well known, fixed in a short list (nothing is fetched).
// Each has a rule for its date and a one-line text with a small tie-in.

type FoodDay = { name: string; text: string; on: (year: number) => Day };

const fixed = (month: number, day: number) => (year: number) => ({ year, month, day });

export const foodDays: readonly FoodDay[] = [
  { name: "Våffeldagen", text: "Idag är det Våffeldagen. Det är dags för våfflor.", on: fixed(3, 25) },
  // Fettisdagen: the Tuesday 47 days before Easter Sunday.
  { name: "Semmeldagen", text: "Idag är det Semmeldagen, fettisdagen. Det blir semla.", on: (year) => addDays(easterSunday(year), -47) },
  { name: "Påskafton", text: "Idag är det påskafton. Ägg och lax hör till.", on: (year) => addDays(easterSunday(year), -1) },
  { name: "Chokladbollens dag", text: "Idag är det Chokladbollens dag. Rulla några?", on: fixed(5, 11) },
  // Midsommarafton: the Friday from 19 to 25 June.
  {
    name: "Midsommarafton",
    text: "Idag är det midsommarafton. Nypotatis och sill?",
    on: (year) => ({ year, month: 6, day: 19 + ((5 - new Date(Date.UTC(year, 5, 19)).getUTCDay() + 7) % 7) }),
  },
  // Kräftpremiären is traditionally the second Wednesday in August.
  { name: "Kräftpremiär", text: "Idag är det kräftpremiär. Dags för kräftskiva?", on: (year) => nthWeekday(year, 8, 3, 2) },
  // Surströmmingspremiären: the third Thursday in August.
  { name: "Surströmmingspremiären", text: "Idag är det surströmmingspremiär. Öppna burken utomhus.", on: (year) => nthWeekday(year, 8, 4, 3) },
  { name: "Kanelbullens dag", text: "Idag är det Kanelbullens dag. Fika efter maten?", on: fixed(10, 4) },
  { name: "Kladdkakans dag", text: "Idag är det Kladdkakans dag. Med grädde?", on: fixed(11, 7) },
  { name: "Köttbullens dag", text: "Idag är det Köttbullens dag. Med lingon.", on: fixed(11, 30) },
  { name: "Lucia", text: "Idag är det Lucia. Lussekatter till kaffet?", on: fixed(12, 13) },
  { name: "Julafton", text: "Idag är det julafton. Smaklig jul!", on: fixed(12, 24) },
];

/** The food day on `day`, or null. */
export function foodDayOn(day: Day): { name: string; text: string } | null {
  const found = foodDays.find((candidate) => sameDay(candidate.on(day.year), day));
  return found ? { name: found.name, text: found.text } : null;
}
