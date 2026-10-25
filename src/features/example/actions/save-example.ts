import { describeExample } from "../domain/rules";
import { loadExample } from "../data/queries";

export async function saveExample(): Promise<string> {
  return describeExample(await loadExample());
}
