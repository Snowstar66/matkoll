"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState, useTransition } from "react";
import { Button } from "@/components/button";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { ListGroup } from "@/components/list-group";
import { useToast } from "@/components/toast";
import { errorMessages } from "@/lib/errors";
import { setAiCap } from "../actions/set-ai-cap";
import { aiCapBounds, capFieldText, formatSek, type HouseholdCost, parseCapInput } from "../domain/ai-cap";

/** The line under a household's name: who is in it. */
function householdLine(household: HouseholdCost): string {
  return household.members || "Inga medlemmar";
}

/**
 * Inställningar → Appens ägare → AI-kostnad: the daily cap in kronor that each household (but the
 * owner's own) may spend on the AI, and every household's estimated cost today and this month.
 * The figures are estimates from the price table in the app; the Anthropic Console has the real bill.
 */
export function AiCostSettings({ capSek, households }: { capSek: number; households: HouseholdCost[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [, startTransition] = useTransition();
  const [text, setText] = useState(capFieldText(capSek));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fieldId = useId();
  const errorId = useId();

  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const value = parseCapInput(text);
    if (value === null) {
      setError(`Skriv ett belopp mellan ${aiCapBounds.min} och 1 000 kr.`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const saved = await setAiCap({ capSek: value });
      if (!saved.ok) {
        setError(saved.error.fields?.cap ?? saved.error.message);
        return;
      }
      setText(capFieldText(saved.data));
      showToast(saved.data === 0 ? "Sparade. AI:n är avstängd för de andra hushållen." : "Sparade taket.");
      startTransition(() => router.refresh());
    } catch {
      setError(errorMessages.ai_cap_save_failed);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="mx-1 mt-2 text-body text-ink-2">
        Så mycket AI får varje hushåll använda per dag, räknat från midnatt. Ditt eget hushåll är undantaget. Är taket nått får hushållet veta att
        det tar slut och kan prova igen i morgon. Med 0 kr är AI:n avstängd för de andra hushållen.
      </p>
      <form onSubmit={save} noValidate className="flex flex-col gap-3 rounded-lg bg-surface p-4" data-testid="ai-cap-form">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={fieldId}>Tak per hushåll och dag (kr)</FieldLabel>
          <Input
            id={fieldId}
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          {error ? <FieldError id={errorId}>{error}</FieldError> : null}
        </div>
        <Button type="submit" fullWidth disabled={pending} data-testid="ai-cap-submit">
          Spara
        </Button>
      </form>

      <h2 id="ai-cost-heading" className="mt-4 px-4 text-meta font-medium text-ink-2">
        Hushåll
      </h2>
      <ListGroup labelledBy="ai-cost-heading" data-testid="ai-cost-households">
        {households.map((household) => (
          <li key={household.id} className="flex min-h-16 items-center gap-3 py-2 pr-4 pl-4" data-testid="ai-cost-row">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-row-title font-normal text-ink">{household.name}</span>
              <span className="truncate text-meta text-ink-2">{householdLine(household)}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end">
              <span className="text-body text-ink">I dag ca {formatSek(household.todaySek)}</span>
              <span className="text-meta text-ink-2">I månaden ca {formatSek(household.monthSek)}</span>
              <span className="text-meta text-ink-2" data-testid="ai-cost-cap">
                {household.exempt ? "Undantaget" : household.capped ? "Taket är nått" : `Tak ${formatSek(capSek)}`}
              </span>
            </span>
          </li>
        ))}
      </ListGroup>
      <p className="mx-1 mt-2 text-meta text-ink-2">
        Beloppen är uppskattningar från priserna i appen. Det som faktiskt dras ser du i Anthropic Console.
      </p>
    </div>
  );
}
