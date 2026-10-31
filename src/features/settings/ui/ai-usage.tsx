import { ListGroup } from "@/components/list-group";
import { formatMonthCost, type AiMonthUsage } from "../domain/ai-usage";

/**
 * "Den här månaden" on the AI page (Story 17.6): the number of AI calls and
 * what they cost, from the price table; local models count as 0 kr.
 */
export function AiUsage({ usage }: { usage: AiMonthUsage }) {
  return (
    <section className="flex flex-col gap-2" data-testid="ai-usage">
      <h2 className="px-1 desktop:px-0 text-section-label text-ink-2">Den här månaden</h2>
      <ListGroup label="Den här månaden">
        <li className="flex min-h-12 items-center gap-3 px-4 py-1.5">
          <span className="min-w-0 flex-1 text-body text-ink">Anrop</span>
          <span className="text-body text-ink-3" data-testid="ai-usage-calls">
            {usage.calls}
          </span>
        </li>
        <li className="flex min-h-12 items-center gap-3 px-4 py-1.5">
          <span className="min-w-0 flex-1 text-body text-ink">Kostnad</span>
          <span className="text-body text-ink-3" data-testid="ai-usage-cost">
            {formatMonthCost(usage.costSek)}
          </span>
        </li>
      </ListGroup>
    </section>
  );
}
