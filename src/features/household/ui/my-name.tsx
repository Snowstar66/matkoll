"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { Avatar } from "@/components/app-shell/avatar";
import { Button } from "@/components/button";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { ChevronRightIcon } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { errorMessages } from "@/lib/errors";
import { setMyName } from "../actions/members";
import { initialOf, type Me, memberNameMaxLength } from "../domain/member";

/** "Namn" under Konto (Story 21.2b): the name the others in the household see; changed in a sheet. */
export function MyName({ me }: { me: Me }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(me.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fieldId = useId();
  const errorId = useId();

  async function save(event?: FormEvent) {
    event?.preventDefault();
    setPending(true);
    try {
      const saved = await setMyName({ name });
      if (!saved.ok) {
        setError(saved.error.fields?.name ?? saved.error.message);
        return;
      }
      showToast("Sparade namnet.");
      setOpen(false);
      router.refresh();
    } catch {
      setError(errorMessages.household_failed);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setName(me.name);
          setError(null);
          setOpen(true);
        }}
        className="flex min-h-16 items-center gap-3 rounded-lg bg-surface px-4 py-2 text-left"
        data-testid="account-name"
      >
        <Avatar initial={initialOf(me.name)} size={40} tone={me.color} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-meta text-ink-3">Namn</span>
          <span className="truncate text-body text-ink">{me.name}</span>
        </span>
        <ChevronRightIcon size={16} className="-mr-1 shrink-0 text-ink-3" />
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Ditt namn"
        closeLabel="Avbryt"
        isDirty={name !== me.name}
        footer={
          <Button fullWidth onClick={() => void save()} disabled={pending}>
            Spara
          </Button>
        }
      >
        <form onSubmit={save} noValidate className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={fieldId}>Förnamn</FieldLabel>
          <Input
            id={fieldId}
            value={name}
            maxLength={memberNameMaxLength}
            autoComplete="given-name"
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          {error ? <FieldError id={errorId}>{error}</FieldError> : (
            <p className="text-meta text-ink-2">Namnet syns för de andra i hushållet.</p>
          )}
        </form>
      </Sheet>
    </>
  );
}
