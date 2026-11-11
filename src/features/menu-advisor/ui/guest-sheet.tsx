"use client";

import { useId, useState } from "react";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { Input } from "@/components/field";
import { Sheet } from "@/components/sheet";
import { allergenIcons, allergenLabels } from "../domain/labels";
import { maxNameLength, newPerson } from "../domain/people";
import type { Person } from "../domain/profile";
import { menuAllergens, type MenuAllergen } from "../domain/types";
import { TasteSection } from "./preference-section";
import { makePersonId } from "./use-people";

/**
 * "Lägg till gäst" in a sheet (Pontus 2026-11-11: a person is added once, so the form does not grow in the list):
 * a name, the allergies, the tastes (the same sliders as a person's own profile, all closed until opened), and whether the guest is kept for next time. Without "Spara till nästa gång" the guest is
 * with tonight only and gone when the page closes. The new guest is ticked at once.
 */
export function GuestSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (guest: Person, keep: boolean) => void }) {
  const id = useId();
  const [name, setName] = useState("");
  const [keep, setKeep] = useState(false);
  const [allergies, setAllergies] = useState<MenuAllergen[]>([]);
  const [tastes, setTastes] = useState<Person["tastes"]>({});

  function reset() {
    setName("");
    setKeep(false);
    setAllergies([]);
    setTastes({});
  }

  function add() {
    onAdd({ ...newPerson(makePersonId(), name.trim() === "" ? "Gäst" : name, "guest"), allergies, tastes }, keep);
    reset();
  }

  function toggle(allergen: MenuAllergen) {
    setAllergies(menuAllergens.filter((entry) => (entry === allergen ? !allergies.includes(entry) : allergies.includes(entry))));
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Lägg till gäst"
      closeLabel="Avbryt"
      footer={
        <Button fullWidth data-testid="menu-guest-save" onClick={add}>
          Lägg till
        </Button>
      }
    >
      {/* Not a <form>: the taste section has a form of its own, and forms do not nest. Enter in the name adds the guest. */}
      <div data-testid="menu-guest-form" className="flex flex-col gap-2 pb-2">
        <label htmlFor={`${id}-guest`} className="text-meta text-ink-2">
          Gästens namn (valfritt)
        </label>
        <Input id={`${id}-guest`} data-testid="menu-guest-name" value={name} maxLength={maxNameLength} autoFocus enterKeyHint="done" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), add())} />
        <span className="mt-2 text-meta text-ink-2">Allergi (valfritt)</span>
        <div className="flex flex-wrap gap-x-2 gap-y-3" role="group" aria-label="Gästens allergier">
          {menuAllergens.map((allergen) => (
            <Chip key={allergen} selected={allergies.includes(allergen)} icon={allergenIcons[allergen]} aria-pressed={allergies.includes(allergen)} onClick={() => toggle(allergen)}>
              {allergenLabels[allergen]}
            </Chip>
          ))}
        </div>
        <div className="mt-4">
          <TasteSection person={{ ...newPerson("guest-draft", name.trim() === "" ? "Gästen" : name, "guest"), allergies, tastes }} onChange={(person) => setTastes(person.tastes)} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip selected={keep} aria-pressed={keep} onClick={() => setKeep(!keep)}>
            Spara till nästa gång
          </Chip>
          <span className="text-meta text-ink-3">Annars bara ikväll.</span>
        </div>
      </div>
    </Sheet>
  );
}
