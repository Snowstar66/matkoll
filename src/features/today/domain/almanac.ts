import type { Day } from "./dates";

// Kinesiska almanackan (lunar-javascript, MIT): computed here from the date, nothing is
// fetched. The library is loaded only when the almanac is switched on (dynamic import), so
// it is not in the Recept bundle otherwise. From the almanac's 宜 (yi, "suitable") and 忌 (ji, "avoid") lists the everyday activities are kept,
// in Swedish and leaning to food, planning and order at home.

/**
 * Almanac activities (from the day's 宜 "suitable" and 忌 "avoid" lists) in order
 * of preference, each as a Swedish infinitive phrase that reads after both "Bra
 * dag att" and "Undvik att". Food first, then planning, then order at home, then
 * the rest; funerals, graves, wells, health and livestock are left out. Several
 * terms can share a phrase; the free renderings are on purpose ("出火", moving
 * the fire, is lighting the grill).
 */
const activities: readonly (readonly [string, string])[] = [
  // Food
  ["开仓", "äta ur förrådet"],
  ["纳财", "fylla på förrådet"],
  ["会亲友", "bjuda hem vänner på mat"],
  ["取渔", "äta fisk"],
  ["割蜜", "baka något sött"],
  ["习艺", "prova ett nytt recept"],
  ["安机械", "testa en köksmaskin"],
  ["作灶", "göra om i köket"],
  ["出火", "laga något i ugnen"],
  ["掘井", "gräva djupt i frysen"],
  // Planning
  ["订盟", "göra upp planer tillsammans"],
  ["结网", "knyta ihop lösa trådar"],
  ["解除", "avsluta något som dragit ut"],
  ["交易", "göra affärer"],
  ["立券", "göra affärer"],
  ["置产", "göra större inköp"],
  // Often on 忌: after planning, so "Undvik att storhandla" is not every other day.
  ["开市", "storhandla"],
  ["入学", "lära sig något nytt"],
  // Order at home
  ["扫舍", "städa hemma"],
  ["造仓", "ordna i förrådet"],
  ["出货财", "rensa ut och ge bort"],
  ["拆卸", "rensa ut"],
  ["破屋", "rensa ut"],
  ["坏垣", "rensa ut"],
  ["补垣", "fixa det som är trasigt"],
  ["塞穴", "fixa det som är trasigt"],
  ["修饰垣墙", "fixa det som är trasigt"],
  ["修造", "fixa i hemmet"],
  ["移徙", "möblera om"],
  ["入宅", "möblera om"],
  ["安床", "byta sängkläder"],
  // The rest
  ["嫁娶", "fira något tillsammans"],
  ["进人口", "ta emot gäster"],
  ["纳采", "ge bort något gott"],
  ["出行", "ge sig ut"],
  ["栽种", "så och plantera"],
  ["词讼", "börja gräla"],
  ["裁衣", "sy"],
  ["理发", "klippa håret"],
  ["沐浴", "ta ett långt bad"],
  // On two days of three: last, so it shows only when nothing else is listed.
  ["祭祀", "laga ett gammalt familjerecept"],
];

/** The almanac's word for a day when nothing should be done. */
const restDay = "诸事不宜";

/** Up to `max` Swedish phrases from an almanac list, in order of preference, none in `skip`. */
export function almanacActivities(list: readonly string[], max = 2, skip: readonly string[] = []): string[] {
  const picked: string[] = [];
  for (const [chinese, swedish] of activities) {
    if (picked.length === max) break;
    if (list.includes(chinese) && !picked.includes(swedish) && !skip.includes(swedish)) picked.push(swedish);
  }
  return picked;
}

/**
 * The almanac's advice for a day in one sentence, or null when neither list has
 * anything kept: "Bra dag att städa hemma och storhandla. Undvik att möblera om."
 * At most two "bra" and one "undvik", so the card stays short; a phrase on both
 * lists (two terms can share one) is kept as "bra" only.
 */
export function almanacAdvice(yi: readonly string[], ji: readonly string[]): string | null {
  if (yi.includes(restDay) || (ji.includes(restDay) && yi.length === 0)) return "En dag att ta det lugnt.";
  const good = almanacActivities(yi, 2);
  const avoid = almanacActivities(ji, 1, good);
  const parts: string[] = [];
  if (good.length > 0) parts.push(`Bra dag att ${good.join(" och ")}.`);
  if (avoid.length > 0) parts.push(`${good.length > 0 ? "Undvik" : "Undvik i dag"} att ${avoid[0]}.`);
  return parts.length > 0 ? parts.join(" ") : null;
}

/** "Almanackan: bra dag att städa hemma. Undvik att storhandla.", or null when the lists hold nothing kept. */
export async function almanacLine({ year, month, day }: Day): Promise<string | null> {
  try {
    const { Solar } = await import("lunar-javascript");
    const lunar = Solar.fromYmd(year, month, day).getLunar();
    const advice = almanacAdvice(lunar.getDayYi(), lunar.getDayJi());
    return advice ? `Almanackan: ${advice.charAt(0).toLocaleLowerCase("sv-SE")}${advice.slice(1)}` : null;
  } catch {
    return null;
  }
}
