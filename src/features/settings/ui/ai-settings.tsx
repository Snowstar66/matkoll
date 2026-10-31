"use client";

import { useId, useState, useSyncExternalStore, useTransition } from "react";
import { FilterPills, type FilterOption } from "@/components/filter-pills";
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
  costSummaryText,
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
  const modelOptions: FilterOption<ClaudeModelId>[] = claudeModels.map((candidate) => ({
    value: candidate.id,
    label: candidate.label,
  }));
  const busy = !hydrated || pending;
  const claude = provider === "anthropic";

  return (
    <section id="ai" aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-section-label text-ink-2">
        AI
      </h2>
      {error ? <Notice role="alert">{error}</Notice> : null}
      <div data-testid="ai-settings" className="flex flex-col gap-4 rounded-lg bg-surface p-4">
        <div className="flex flex-col gap-2">
          <p className="text-meta font-semibold text-ink-2">Leverantör</p>
          <FilterPills
            segmented
            label="Leverantör"
            options={providerOptions}
            value={provider}
            disabled={busy}
            onChange={(value) => save({ provider: value, model, level })}
          />
          {!view.claudeAvailable ? (
            <p data-testid="ai-claude-missing" className="text-meta text-ink-2">
              {claudeKeyMissingText}
            </p>
          ) : null}
          {!view.qwenAvailable ? <p className="text-meta text-ink-2">{qwenUnavailableText}</p> : null}
          {view.isDefault ? (
            <p data-testid="ai-default-note" className="text-meta text-ink-2">
              Standard just nu: {view.effective ? "Claude Haiku 5.5, Medel" : view.defaultText}. Ditt val sparas när du ändrar.
            </p>
          ) : null}
        </div>

        {provider === "lmstudio" ? (
          <div className="flex flex-col gap-1">
            <p className="text-meta font-semibold text-ink-2">Modell</p>
            <p className="text-body break-all text-ink">{view.qwenModel}</p>
          </div>
        ) : null}

        {claude ? (
          <div className="flex flex-col gap-2">
            <p className="text-meta font-semibold text-ink-2">Modell</p>
            <FilterPills
              segmented
              label="Modell"
              options={modelOptions}
              value={model}
              disabled={busy}
              onChange={(value) => save({ provider, model: value, level })}
            />
            <ul className="flex flex-col gap-1" aria-label="Ungefärlig kostnad per anrop">
              {claudeModels.map((candidate) => (
                <li
                  key={candidate.id}
                  className={candidate.id === model ? "text-meta text-ink" : "text-meta text-ink-3"}
                >
                  <span className="font-semibold">{candidate.label}</span>: {costSummaryText(candidate)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <p className="text-meta font-semibold text-ink-2">Nivå</p>
          <FilterPills
            segmented
            label="Nivå"
            options={levelOptions}
            value={level}
            disabled={busy || !claude}
            onChange={(value) => save({ provider, model, level: value })}
          />
          {!claude ? (
            <p id={noteId} className="text-meta text-ink-2">
              {levelOffForQwenText}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
