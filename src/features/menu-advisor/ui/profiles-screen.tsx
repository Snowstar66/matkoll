"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { Input } from "@/components/field";
import { ChevronRightIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { allergyDisclaimer } from "../domain/disclaimer";
import { allergenIcons, allergenLabels } from "../domain/labels";
import { drinkIcons, drinkLabels, type HouseholdPerson, isHouseholdPerson, maxNameLength, meId, toggleAllergy } from "../domain/people";
import { drinkKinds, type Person } from "../domain/profile";
import { TasteSection } from "./preference-section";
import { menuAllergens } from "../domain/types";
import { usePeople } from "./use-people";

// Smak och allergier (Inställningar → Medlemmar): per person the allergies (a row that opens its own page, registered once), a two-way
// slider per taste (nothing filled in = eats anything) and the drink they usually order. Saved for the household as you go (this device's own list when the household's cannot be reached).

/**
 * One person's profile (Inställningar → Medlemmar → Smak och allergier): taste, usual drink and allergies, and the
 * allergies in a box of their own. Does not need the Menyrådgivare option: what is filled in steers the whole app.
 * `personId`: the person's id ("me", "m-<userId>" or one added by hand). `members`: the household's members, read on
 * the server (null = could not be read: only "Du" and those added by hand). `profiles`: what the household has saved,
 * read on the server (null = could not be read: this device's own list). `backHref`: where the list is.
 */
export function ProfilesScreen({
  personId,
  members = null,
  profiles = null,
  backHref,
}: {
  personId: string;
  members?: readonly HouseholdPerson[] | null;
  profiles?: Person[] | null;
  backHref: string;
}) {
  const router = useRouter();
  const { people, save, remove, notice } = usePeople(members, profiles);
  const [allergies, setAllergies] = useState(false);
  const current = people.find((person) => person.id === personId);

  let screen: ReactNode;
  if (!current) {
    screen = (
      <div className="flex flex-col gap-3" data-testid="menu-profile-missing">
        <Notice>Personen finns inte längre.</Notice>
        <Link href={backHref} className="inline-flex min-h-tap items-center text-control font-medium text-accent">
          Till Medlemmar
        </Link>
      </div>
    );
  } else if (allergies) {
    screen = <AllergiesView person={current} onChange={save} onBack={() => setAllergies(false)} />;
  } else {
    screen = (
      <PersonView
        person={current}
        onChange={save}
        onAllergies={() => setAllergies(true)}
        onRemove={() => {
          void remove(current.id).then((gone) => {
            if (gone) router.push(backHref);
          });
        }}
      />
    );
  }
  return (
    <>
      {screen}
      {notice ? (
        <p data-testid="menu-profiles-notice" role="status" className="mt-4 text-meta text-ink-3">
          {notice}
        </p>
      ) : null}
    </>
  );
}

function PersonView({
  person,
  onChange,
  onAllergies,
  onRemove,
}: {
  person: Person;
  onChange: (person: Person) => void;
  onAllergies: () => void;
  onRemove: () => void;
}) {
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex flex-col gap-5" data-testid="menu-profile">
      {isHouseholdPerson(person) ? (
        <h2 className="text-section-title text-ink">{person.name}</h2>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-name`} className="text-control text-ink">
            Namn
          </label>
          <NameField id={`${id}-name`} person={person} onChange={onChange} />
        </div>
      )}

      <AllergiesRow person={person} onAllergies={onAllergies} />

      <TasteSection person={person} onChange={onChange} />

      <p className="rounded-md bg-fill px-3 py-2 text-meta text-ink-2">Allergier = får aldrig föreslås. Undviker (Ogillar och Hellre inte) = föreslås inte i första hand.</p>

      <section aria-labelledby={`${id}-drink`} className="flex flex-col gap-2">
        <h3 id={`${id}-drink`} className="text-section-label text-ink-2 uppercase">
          Dricker oftast
        </h3>
        <div className="flex flex-wrap gap-x-2 gap-y-3" role="group" aria-label="Dryck">
          {drinkKinds.map((kind) => (
            <Chip
              key={kind}
              selected={person.drink === kind}
              icon={drinkIcons[kind]}
              aria-pressed={person.drink === kind}
              onClick={() => onChange({ ...person, drink: person.drink === kind ? null : kind })}
            >
              {drinkLabels[kind]}
            </Chip>
          ))}
        </div>
      </section>

      {isHouseholdPerson(person) ? (
        <p className="text-meta text-ink-3">Sparas för hushållet och syns på alla era telefoner. Alla i hushållet kan ändra.</p>
      ) : confirming ? (
        <div className="flex flex-col gap-2 rounded-lg bg-surface p-4">
          <p className="text-body text-ink">Ta bort {person.name}? Det går inte att ångra.</p>
          <div className="flex gap-2">
            <Button variant="danger" onClick={onRemove}>
              Ta bort
            </Button>
            <Button variant="quiet" onClick={() => setConfirming(false)}>
              Avbryt
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-meta text-ink-3">Sparas för hushållet och syns på alla era telefoner. Alla i hushållet kan ändra.</p>
          <Button variant="danger" className="self-start" onClick={() => setConfirming(true)}>
            Ta bort {person.name}
          </Button>
        </>
      )}
    </div>
  );
}

function AllergiesRow({ person, onAllergies }: { person: Person; onAllergies: () => void }) {
  return (
    <button
      type="button"
      data-testid="menu-allergies-open"
      onClick={onAllergies}
      className="flex min-h-row w-full items-center gap-3 rounded-lg bg-surface px-4 py-2.5 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-row-title">Allergier</span>
        <span className="block text-meta text-ink-2">
          {person.allergies.length > 0 ? person.allergies.map((allergen) => allergenLabels[allergen].toLowerCase()).join(", ") : "Inga angivna"}
        </span>
      </span>
      <ChevronRightIcon size={20} className="shrink-0 text-ink-3" />
    </button>
  );
}

function AllergiesView({ person, onChange, onBack }: { person: Person; onChange: (person: Person) => void; onBack: () => void }) {
  return (
    <div className="flex flex-col gap-4" data-testid="menu-allergies">
      <Button variant="compact" onClick={onBack} className="self-start">
        Tillbaka
      </Button>
      <div>
        <h2 className="text-section-title text-ink">Allergier, {person.id === meId ? "du" : person.name}</h2>
        <p className="mt-1 text-body text-ink-2">Anger du det här en gång markeras rätterna som inte passar, varje gång.</p>
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-3" role="group" aria-label="Allergier">
        {menuAllergens.map((allergen) => (
          <Chip
            key={allergen}
            selected={person.allergies.includes(allergen)}
            icon={allergenIcons[allergen]}
            aria-pressed={person.allergies.includes(allergen)}
            onClick={() => onChange(toggleAllergy(person, allergen))}
          >
            {allergenLabels[allergen]}
          </Chip>
        ))}
      </div>
      <p className="rounded-md bg-fill px-3 py-2 text-meta text-ink-2">{allergyDisclaimer}</p>
    </div>
  );
}

/** The name field keeps what is typed, and saves it as long as it is not empty (an empty name would not be a person). */
function NameField({ id, person, onChange }: { id: string; person: Person; onChange: (person: Person) => void }) {
  const [text, setText] = useState(person.name);
  return (
    <Input
      id={id}
      value={text}
      maxLength={maxNameLength}
      onChange={(event) => {
        setText(event.target.value);
        if (event.target.value.trim() !== "") onChange({ ...person, name: event.target.value.trim() });
      }}
      onBlur={() => setText(person.name)}
    />
  );
}
