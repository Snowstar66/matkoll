"use client";

import { type FormEvent, type KeyboardEvent, useId, useRef, useState, useSyncExternalStore, useTransition } from "react";
import type { FilterOption } from "@/components/filter-pills";
import { Button } from "@/components/button";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { Segment } from "@/components/segment";
import { ListGroup } from "@/components/list-group";
import { Notice } from "@/components/notice";
import { useToast } from "@/components/toast";
import { errorMessages, fail, type Result } from "@/lib/errors";
import { saveAiSetting } from "../actions/save-ai-setting";
import { verifyAiPassword } from "../actions/verify-ai-password";
import {
  aiLevelLabels,
  aiLevels,
  aiProviderLabels,
  claudeKeyMissingText,
  claudeModels,
  costPerCallText,
  defaultClaudeLevel,
  defaultClaudeModel,
  levelOffForQwenText,
  qwenUnavailableText,
  type AiLevel,
  type AiProviderChoice,
  type AiSettingInput,
  type AiSettingsView,
  type ClaudeModelId,
} from "../domain/ai-choice";

export type AiSettingsProps = { view: AiSettingsView };

const noSubscription = () => () => {};

/** False during server rendering and before hydration, true once React runs in the browser. */
function useHydrated() {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

const levelOptions: FilterOption<AiLevel>[] = aiLevels.map((level) => ({ value: level, label: aiLevelLabels[level] }));

function isClaudeModel(model: string | undefined): model is ClaudeModelId {
  return claudeModels.some((candidate) => candidate.id === model);
}

/**
 * AI in Inställningar (Story 17.5): provider (Standard, Qwen lokalt, Claude),
 * for Claude the model with an estimated cost per call, and the level (Låg,
 * Medel, Hög), which only Claude uses. One choice for every task. A change is
 * saved at once and the next AI job uses it, without a restart; "Standard"
 * removes the choice, so AI_PROVIDER/AI_MODEL decide. A provider whose key or
 * URL is missing cannot be chosen and says what to do. The choice is read-only
 * until the password is given ("Lås upp för att ändra"); the password stays in
 * this component's state for the page session and goes along with each save,
 * where the server checks it again.
 */
export function AiSettings({ view }: AiSettingsProps) {
  const { showToast } = useToast();
  const hydrated = useHydrated();
  const [pending, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [provider, setProvider] = useState<AiProviderChoice>(view.effective?.provider ?? "lmstudio");
  const [model, setModel] = useState<ClaudeModelId>(
    view.effective?.provider === "anthropic" && isClaudeModel(view.effective.model)
      ? view.effective.model
      : defaultClaudeModel,
  );
  const [level, setLevel] = useState<AiLevel>(view.effective?.effort ?? defaultClaudeLevel);
  const headingId = useId();
  const noteId = useId();

  function save(next: { provider: AiProviderChoice; model: ClaudeModelId; level: AiLevel }) {
    if (password === null) return;
    const previous = { provider, model, level };
    setError(null);
    setProvider(next.provider);
    setModel(next.model);
    setLevel(next.level);
    const input: AiSettingInput =
      next.provider === "anthropic"
        ? { provider: "anthropic", model: next.model, effort: next.level }
        : { provider: next.provider };
    startSaving(async () => {
      let result: Result<AiSettingInput>;
      try {
        result = await saveAiSetting(input, password ?? "");
      } catch {
        result = fail("settings_save_failed");
      }
      if (result.ok) {
        showToast("Sparat. Nästa AI-jobb använder valet.");
        return;
      }
      setProvider(previous.provider);
      setModel(previous.model);
      setLevel(previous.level);
      // `validation` here means the server does not offer the choice (key missing, section hidden).
      setError(result.error.code === "validation" ? errorMessages.settings_save_failed : result.error.message);
    });
  }

  const providerOptions: FilterOption<AiProviderChoice>[] = [
    { value: "lmstudio", label: aiProviderLabels.lmstudio, disabled: !view.qwenAvailable },
    { value: "anthropic", label: aiProviderLabels.anthropic, disabled: !view.claudeAvailable },
  ];
  const unlocked = password !== null;
  const busy = !hydrated || pending || !unlocked;
  const claude = provider === "anthropic";

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-5" data-testid="ai-settings">
      <h2 id={headingId} className="sr-only">
        AI
      </h2>
      {error ? <Notice role="alert">{error}</Notice> : null}
      <AiUnlock unlocked={unlocked} hydrated={hydrated} onUnlock={setPassword} />
      <div className="flex flex-col gap-2">
        <p className="px-1 desktop:px-0 text-section-label text-ink-2">Leverantör</p>
        <Segment
          label="Leverantör"
          options={providerOptions}
          value={provider}
          disabled={busy}
          onChange={(value) => save({ provider: value, model, level })}
          className="w-full"
        />
        {!view.claudeAvailable ? (
          <p data-testid="ai-claude-missing" className="px-1 desktop:px-0 text-meta text-ink-3">
            {claudeKeyMissingText}
          </p>
        ) : null}
        {!view.qwenAvailable ? <p className="px-1 desktop:px-0 text-meta text-ink-3">{qwenUnavailableText}</p> : null}
        {view.isDefault ? (
          <p data-testid="ai-default-note" className="px-1 desktop:px-0 text-meta text-ink-3">
            Standard just nu: {view.effective ? "Claude Haiku 5.5, Medel" : view.defaultText}. Ditt val sparas när du ändrar.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <p className="px-1 desktop:px-0 text-section-label text-ink-2">Modell</p>
        {provider === "lmstudio" ? (
          <ListGroup label="Modell">
            <li className="flex min-h-14 flex-col justify-center px-4 py-2">
              <span className="text-body break-all text-ink">{view.qwenModel}</span>
            </li>
          </ListGroup>
        ) : (
          <ModelChoice model={model} disabled={busy} onChange={(value) => save({ provider, model: value, level })} />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="px-1 desktop:px-0 text-section-label text-ink-2">Nivå</p>
        <Segment
          label="Nivå"
          options={levelOptions}
          value={level}
          disabled={busy || !claude}
          onChange={(value) => save({ provider, model, level: value })}
          className="w-full"
        />
        <p id={noteId} className="px-1 desktop:px-0 text-meta text-ink-3">
          {claude ? "Högre nivå tänker längre: bättre svar men långsammare och lite dyrare." : levelOffForQwenText}
        </p>
      </div>
    </section>
  );
}

/** "Lås upp för att ändra": asks for the password, has the server check it, and hands it up on success. */
function AiUnlock({
  unlocked,
  hydrated,
  onUnlock,
}: {
  unlocked: boolean;
  hydrated: boolean;
  onUnlock: (password: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);
  const [checking, startChecking] = useTransition();
  const inputId = useId();
  const errorId = useId();

  if (unlocked) {
    return (
      <p data-testid="ai-unlocked" className="px-1 desktop:px-0 text-meta text-ink-3">
        Upplåst. Du kan ändra valet tills du lämnar sidan.
      </p>
    );
  }
  if (!open) {
    return (
      <div className="flex flex-col items-start gap-1">
        <p className="px-1 desktop:px-0 text-meta text-ink-3">Valet är låst och kan bara läsas.</p>
        <Button variant="secondary" disabled={!hydrated} onClick={() => setOpen(true)}>
          Lås upp för att ändra
        </Button>
      </div>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (checking || value === "") return;
    setWrong(false);
    startChecking(async () => {
      let result: Result<true>;
      try {
        result = await verifyAiPassword(value);
      } catch {
        result = fail("validation");
      }
      if (result.ok) onUnlock(value);
      else {
        setWrong(true);
        setValue("");
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" data-testid="ai-unlock-form">
      <FieldLabel htmlFor={inputId}>Lösenord</FieldLabel>
      <Input
        id={inputId}
        type="password"
        autoComplete="off"
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-invalid={wrong}
        aria-describedby={wrong ? errorId : undefined}
      />
      {wrong ? (
        <FieldError id={errorId} role="alert">
          Fel lösenord.
        </FieldError>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={checking || value === ""}>
          Lås upp
        </Button>
        <Button variant="quiet" onClick={() => setOpen(false)}>
          Avbryt
        </Button>
      </div>
    </form>
  );
}

/** The Claude models as rows with a check on the chosen one (a radio group; the arrow keys move the choice). */
function ModelChoice({
  model,
  disabled,
  onChange,
}: {
  model: ClaudeModelId;
  disabled: boolean;
  onChange: (model: ClaudeModelId) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (index + step + claudeModels.length) % claudeModels.length;
    refs.current[next]?.focus();
    onChange(claudeModels[next].id);
  }

  return (
    <ListGroup label="Modell">
      <li role="none">
        <div role="radiogroup" aria-label="Modell" className="flex flex-col divide-y divide-hairline">
          {claudeModels.map((candidate, index) => {
            const chosen = candidate.id === model;
            return (
              <button
                key={candidate.id}
                ref={(element) => {
                  refs.current[index] = element;
                }}
                type="button"
                role="radio"
                aria-checked={chosen}
                aria-labelledby={`${baseId}-${candidate.id}-name`}
                aria-describedby={`${baseId}-${candidate.id}-note`}
                tabIndex={chosen ? 0 : -1}
                disabled={disabled}
                onClick={() => !chosen && onChange(candidate.id)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className="flex min-h-14 items-center gap-3 px-4 py-2 text-left focus-visible:-outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span id={`${baseId}-${candidate.id}-name`} className="text-body text-ink">
                    {candidate.label}
                  </span>
                  <span id={`${baseId}-${candidate.id}-note`} className="text-meta text-ink-3">
                    {candidate.note} · {costPerCallText(candidate, "import")}
                  </span>
                </span>
                <span aria-hidden="true" className="w-5 text-center text-row-title text-accent">
                  {chosen ? "✓" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </li>
    </ListGroup>
  );
}
