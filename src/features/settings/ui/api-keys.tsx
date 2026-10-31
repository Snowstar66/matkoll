"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/button";
import { ListGroup } from "@/components/list-group";
import { Notice } from "@/components/notice";
import { useToast } from "@/components/toast";
import { errorMessages } from "@/lib/errors";
import { createApiKey, revokeApiKey } from "../actions/api-keys";
import { type ApiKeyView, keyDateText, keyStatusText, maxApiKeys, quickAddUrl } from "../domain/api-key";
import { appName } from "@/app/app-info";

const noSubscription = () => () => {};
const originNow = () => window.location.origin;
const originOnServer = () => null;

/**
 * "Siri och genvägar" (Story 17.9): the personal keys with "Återkalla", "Skapa nyckel", and,
 * once a key is made, the key itself with "Kopiera" and the guide for the iOS shortcut. The key is
 * kept in this component's state only: it is shown this once and is not stored anywhere readable.
 */
export function ApiKeys({ keys }: { keys: readonly ApiKeyView[] }) {
  const { showToast } = useToast();
  const origin = useSyncExternalStore<string | null>(noSubscription, originNow, originOnServer);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const working = keys.filter((key) => !key.revokedAt);
  const revoked = keys.filter((key) => key.revokedAt);

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: { message: string } }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) setError(result.error.message);
    } catch {
      setError(errorMessages.settings_save_failed);
    } finally {
      setBusy(false);
    }
  }

  function create() {
    return run(async () => {
      const result = await createApiKey();
      if (result.ok) setNewKey(result.data.key);
      return result;
    });
  }

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(done);
    } catch {
      showToast("Det gick inte att kopiera. Markera texten och kopiera den själv.");
    }
  }

  const address = origin ? quickAddUrl(origin) : "";

  return (
    <section aria-label="Siri och genvägar" className="flex flex-col gap-4" data-testid="api-keys">
      <p className="px-1 desktop:px-0 text-meta text-ink-3">
        Med en personlig nyckel kan en genväg på iPhone lägga till varor i inköpslistan när du säger dem till Siri.
      </p>
      {error ? <Notice role="alert">{error}</Notice> : null}

      {newKey ? (
        <div className="flex flex-col gap-3 rounded-lg bg-surface p-4" data-testid="new-key">
          <p className="text-row-title text-ink">Din nyckel</p>
          <p className="text-meta text-ink-3">Den visas bara nu. Kopiera den till genvägen innan du lämnar sidan.</p>
          <code data-testid="new-key-value" className="block break-all rounded-md bg-bg p-3 text-meta text-ink select-all">
            {newKey}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => copy(newKey, "Nyckeln är kopierad.")}>
              Kopiera nyckeln
            </Button>
            <Button variant="text" onClick={() => copy(`Bearer ${newKey}`, "Rubriken är kopierad.")}>
              Kopiera som rubrik
            </Button>
          </div>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-body text-ink-2" data-testid="shortcut-guide">
            <li>Öppna appen Genvägar på iPhone, tryck på + och döp genvägen till ”{appName}”.</li>
            <li>Lägg till åtgärden Diktera text.</li>
            <li>
              Lägg till Hämta innehållet i URL. Adress: <span className="break-all text-ink">{address}</span>. Metod: POST.
            </li>
            <li>
              Under Rubriker lägger du till Authorization med värdet Bearer och nyckeln (knappen Kopiera som rubrik ger hela värdet).
            </li>
            <li>
              Under Begärans innehåll väljer du JSON och lägger till texten <span className="text-ink">text</span> med Dikterad text som värde.
            </li>
            <li>Lägg till Visa resultat sist.</li>
            <li>Säg ”Hej Siri, {appName}” och sedan vad du vill lägga till, till exempel ”mjölk och ägg”.</li>
          </ol>
          <p className="text-meta text-ink-3">
            Genvägen når bara {appName} när appen ligger i molnet. En telefon kan inte nå localhost.
          </p>
        </div>
      ) : null}

      {working.length > 0 ? (
        <ListGroup label="Nycklar">
          {working.map((key) => (
            <li key={key.id} data-testid="api-key" className="flex min-h-[52px] items-center justify-between gap-3 py-2 pl-4 pr-1">
              <div className="min-w-0">
                <p className="text-body text-ink">{key.label}</p>
                <p className="text-meta text-ink-3">{keyStatusText(key)}</p>
              </div>
              <button
                type="button"
                aria-label={`Återkalla nyckeln som skapades ${keyDateText(key.createdAt)}`}
                disabled={busy}
                onClick={() => run(() => revokeApiKey(key.id))}
                className="min-h-tap min-w-tap shrink-0 rounded-md px-3 text-meta text-ink-3 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Återkalla
              </button>
            </li>
          ))}
        </ListGroup>
      ) : (
        <p className="text-body text-ink-2">Inga nycklar än.</p>
      )}

      <Button fullWidth disabled={busy || working.length >= maxApiKeys} onClick={create}>
        Skapa nyckel
      </Button>

      {revoked.length > 0 ? (
        <ListGroup label="Återkallade nycklar">
          {revoked.map((key) => (
            <li key={key.id} data-testid="api-key-revoked" className="flex min-h-[52px] flex-col justify-center py-2 pl-4 pr-3">
              <p className="text-body text-ink-3">{key.label}</p>
              <p className="text-meta text-ink-3">{keyStatusText(key)}</p>
            </li>
          ))}
        </ListGroup>
      ) : null}
    </section>
  );
}
