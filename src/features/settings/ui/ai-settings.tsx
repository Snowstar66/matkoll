"use client";

import { type KeyboardEvent, useId, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { FilterPills, type FilterOption } from "@/components/filter-pills";
import { ListGroup } from "@/components/list-group";
import { Notice } from "@/components/notice";
import { useToast } from "@/components/toast";
import { errorMessages, fail, type Result } from "@/lib/errors";
import { saveAiSetting } from "../actions/save-ai-setting";
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
 * URL is missing cannot be chosen and says what to do.
 */
export function AiSettings({ view }: AiSettingsProps) {
  const { showToast } = useToast();
  const hydrated = useHydrated();
  const [pending, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
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
        result = await saveAiSetting(input);
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
  const busy = !hydrated || pending;
  const claude = provider === "anthropic";

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-5" data-testid="ai-settings">
      <h2 id={headingId} className="sr-only">
        AI
      </h2>
      {error ? <Notice role="alert">{error}</Notice> : null}
      <div className="flex flex-col gap-2">
        <p className="px-1 text-section-label text-ink-2">Leverantör</p>
        <FilterPills
          segmented
          label="Leverantör"
          options={providerOptions}
          value={provider}
          disabled={busy}
          onChange={(value) => save({ provider: value, model, level })}
          className="h-9 w-full [&>button]:flex-1"
        />
        {!view.claudeAvailable ? (
          <p data-testid="ai-claude-missing" className="px-1 text-meta text-ink-3">
            {claudeKeyMissingText}
          </p>
        ) : null}
        {!view.qwenAvailable ? <p className="px-1 text-meta text-ink-3">{qwenUnavailableText}</p> : null}
        {view.isDefault ? (
          <p data-testid="ai-default-note" className="px-1 text-meta text-ink-3">
            Standard just nu: {view.effective ? "Claude Haiku 5.5, Medel" : view.defaultText}. Ditt val sparas när du ändrar.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-section-label text-ink-2">Modell</p>
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
        <p className="px-1 text-section-label text-ink-2">Nivå</p>
        <FilterPills
          segmented
          label="Nivå"
          options={levelOptions}
          value={level}
          disabled={busy || !claude}
          onChange={(value) => save({ provider, model, level: value })}
          className="h-9 w-full [&>button]:flex-1"
        />
        <p id={noteId} className="px-1 text-meta text-ink-3">
          {claude ? "Högre nivå tänker längre: bättre svar men långsammare och lite dyrare." : levelOffForQwenText}
        </p>
      </div>
    </section>
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
