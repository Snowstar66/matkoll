"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { Sheet } from "@/components/sheet";
import { Input } from "@/components/field";
import { allergenIcons, allergenLabels } from "../domain/labels";
import { companySummary, maxNameLength, newPerson, toggleAllergy } from "../domain/people";
import { menuAllergens, type MenuAllergen } from "../domain/types";
import type { Person } from "../domain/profile";
import { makePersonId } from "./use-people";

/** Who is with tonight: the saved people to pick from, guests with just a name, and a summary line. */
export function CompanySheet({
  open,
  onClose,
  people,
  selectedIds,
  onSelectedIds,
  tempGuests,
  onTempGuests,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  /** The saved people, "Du" first. */
  people: Person[];
  selectedIds: string[];
  onSelectedIds: (ids: string[]) => void;
  /** Guests added for tonight only (not saved). */
  tempGuests: Person[];
  onTempGuests: (guests: Person[]) => void;
  onSave: (person: Person) => void;
}) {
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [keep, setKeep] = useState(false);
  const [allergies, setAllergies] = useState<MenuAllergen[]>([]);
  const everyone = [...people, ...tempGuests];
  const company = everyone.filter((person) => selectedIds.includes(person.id));

  function toggle(personId: string) {
    onSelectedIds(selectedIds.includes(personId) ? selectedIds.filter((entry) => entry !== personId) : [...selectedIds, personId]);
  }

  function addGuest() {
    const guest = { ...newPerson(makePersonId(), name.trim() === "" ? "Gäst" : name, "guest"), allergies };
    if (keep) onSave(guest);
    else onTempGuests([...tempGuests, guest]);
    onSelectedIds([...selectedIds, guest.id]);
    setName("");
    setKeep(false);
    setAllergies([]);
    setAdding(false);
  }

  function saveTemp(guest: Person) {
    onSave(guest);
    onTempGuests(tempGuests.filter((entry) => entry.id !== guest.id));
  }

  return (
    <Sheet open={open} onClose={onClose} title="Vilka är med?" closeLabel="Klar">
      <div data-testid="menu-company" className="flex flex-col gap-3 pb-2">
        <p data-testid="menu-company-summary" className="text-row-title text-ink">
          {companySummary(company)}
        </p>
        <div className="flex flex-wrap gap-x-2 gap-y-3" role="group" aria-label="Sällskap">
          {everyone.map((person) => (
            <Chip key={person.id} selected={selectedIds.includes(person.id)} aria-pressed={selectedIds.includes(person.id)} onClick={() => toggle(person.id)}>
              {person.name}
            </Chip>
          ))}
          {adding ? null : (
            <Chip selected={false} dashed onClick={() => setAdding(true)}>
              Lägg till gäst
            </Chip>
          )}
        </div>
        {tempGuests.length > 0 ? (
          <ul className="flex flex-col">
            {tempGuests.map((guest) => (
              <li key={guest.id} className="flex items-center justify-between gap-2 text-meta text-ink-2">
                <span className="min-w-0 truncate">{guest.name} är med bara ikväll</span>
                <Button variant="compact" onClick={() => saveTemp(guest)}>
                  Spara gäst
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {adding ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              addGuest();
            }}
          >
            <label htmlFor={`${id}-guest`} className="text-meta text-ink-2">
              Gästens namn (valfritt)
            </label>
            <Input id={`${id}-guest`} data-testid="menu-guest-name" value={name} maxLength={maxNameLength} autoFocus onChange={(event) => setName(event.target.value)} />
            <span className="text-meta text-ink-2">Allergi (valfritt)</span>
            <div className="flex flex-wrap gap-x-2 gap-y-3" role="group" aria-label="Gästens allergier">
              {menuAllergens.map((allergen) => (
                <Chip
                  key={allergen}
                  selected={allergies.includes(allergen)}
                  icon={allergenIcons[allergen]}
                  aria-pressed={allergies.includes(allergen)}
                  onClick={() => setAllergies(toggleAllergy({ ...newPerson("x", "x", "guest"), allergies }, allergen).allergies)}
                >
                  {allergenLabels[allergen]}
                </Chip>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Chip selected={keep} aria-pressed={keep} onClick={() => setKeep(!keep)}>
                Spara gäst
              </Chip>
              <span className="text-meta text-ink-3">{keep ? "Finns kvar nästa gång." : "Bara ikväll."}</span>
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="compact-primary">
                Lägg till
              </Button>
              <Button
                variant="compact"
                onClick={() => {
                  setAdding(false);
                  setName("");
                }}
              >
                Avbryt
              </Button>
            </div>
          </form>
        ) : null}
        <Link href="/installningar/tillval/aata-ute" className="inline-flex min-h-tap items-center self-start text-body font-medium text-accent">
          Profiler: allergier och vad ni gillar
        </Link>
        <p className="text-meta text-ink-3">Allergier som står i profilerna används när jag väljer rätter åt er.</p>
      </div>
    </Sheet>
  );
}
