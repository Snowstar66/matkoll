import { Solar } from "lunar-javascript";
import type { Day } from "./dates";

// Kinesiska almanackan (lunar-javascript, MIT): computed here from the date, nothing is
// fetched. The day's animal and element come from its day pillar; of the almanac's
// 宜 (yi, "suitable") list only the calm, everyday activities are kept, in Swedish.

const animals: Record<string, string> = {
  鼠: "Råttans",
  牛: "Oxens",
  虎: "Tigerns",
  兔: "Harens",
  龙: "Drakens",
  蛇: "Ormens",
  马: "Hästens",
  羊: "Getens",
  猴: "Apans",
  鸡: "Tuppens",
  狗: "Hundens",
  猪: "Grisens",
};

/** The five elements by the day's heavenly stem. */
const elements: Record<string, string> = {
  甲: "trä",
  乙: "trä",
  丙: "eld",
  丁: "eld",
  戊: "jord",
  己: "jord",
  庚: "metall",
  辛: "metall",
  壬: "vatten",
  癸: "vatten",
};

/** Almanac activities in order of preference (food and company first) and their short Swedish text. */
const activities: readonly (readonly [string, string])[] = [
  ["宴会", "bjuda på middag"],
  ["会亲友", "träffa vänner"],
  ["嫁娶", "fira något tillsammans"],
  ["订盟", "fira något tillsammans"],
  ["交易", "handla"],
  ["开市", "handla"],
  ["出行", "ge sig ut"],
  ["栽种", "så och plantera"],
  ["裁衣", "sy"],
  ["理发", "klippa håret"],
  ["沐浴", "bada"],
];

/** Up to `max` short Swedish activities from the day's 宜 list. */
export function almanacActivities(yi: readonly string[], max = 2): string[] {
  const picked: string[] = [];
  for (const [chinese, swedish] of activities) {
    if (yi.includes(chinese) && !picked.includes(swedish)) picked.push(swedish);
    if (picked.length === max) break;
  }
  return picked;
}

/** "Hundens dag · gynnsamt: träffa vänner", or "Hundens dag · eld" when the list holds nothing fitting. */
export function almanacLine({ year, month, day }: Day): string | null {
  try {
    const lunar = Solar.fromYmd(year, month, day).getLunar();
    const animal = animals[lunar.getDayShengXiao()];
    if (!animal) return null;
    const base = `${animal} dag`;
    const things = almanacActivities(lunar.getDayYi());
    if (things.length > 0) return `${base} · gynnsamt: ${things.join(" eller ")}`;
    const element = elements[lunar.getDayGan()];
    return element ? `${base} · ${element}` : base;
  } catch {
    return null;
  }
}
