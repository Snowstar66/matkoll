"use client";

import Link from "next/link";
import { useId, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { Input } from "@/components/field";
import { ChevronRightIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { Segment } from "@/components/segment";
import { useOption } from "@/lib/use-option";
import { allergyDisclaimer } from "../domain/disclaimer";
import { allergenIcons, allergenLabels } from "../domain/labels";
import { drinkIcons, drinkLabels, type HouseholdPerson, isHouseholdPerson, maxNameLength, maxPeople, meId, newPerson, tasteLabels, toggleAllergy, withoutTag, withTag, withTaste } from "../domain/people";
import { drinkKinds, type Person, type Taste, tasteKeys } from "../domain/profile";
import { PreferenceSection } from "./preference-section";
import { menuAllergens } from "../domain/types";
import { makePersonId, usePeople } from "./use-people";

// Profiles for Äta ute (Tillval): per person a taste list (nothing filled in = eats anything), the drink they usually
// order, and their allergies in a box of their own, registered once. Saved on this device as you go; no account.

type View = { name: "list" } | { name: "person"; id: string } | { name: "allergies"; id: string };

const noopSubscribe = () => () => {};

const dislikeSuggestions = ["koriander", "vitlök", "lök", "svamp", "oliver", "ost", "kryddstarkt", "fisk", "skaldjur", "ingefära"];
const likeSuggestions = ["pasta", "pizza", "paprika", "nasi goreng", "tacos", "sushi", "ost", "chili", "grillat"];

const tasteOptions = [
  { value: "-2", label: "Hatar", icon: <span className="whitespace-nowrap text-[13px] tracking-tighter">👎👎</span> },
  { value: "-1", label: "Ogillar", icon: "👎" },
  { value: "0", label: "Ingen åsikt", icon: "–" },
  { value: "1", label: "Gillar", icon: "👍" },
  { value: "2", label: "Älskar", icon: <span className="whitespace-nowrap text-[13px] tracking-tighter">👍👍</span> },
].map((option) => ({ ...option, iconOnly: true }));

/** The Tillval link row to the profiles, shown only while Menyrådgivare is on. */
export function MenuProfilesLink() {
  const on = useOption("menuAdvisor");
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted || !on) return null;
  return (
    <Link
      href="/installningar/tillval/aata-ute"
      data-testid="menu-profiles-link"
      className="mb-6 flex min-h-row items-center gap-3 rounded-lg bg-surface px-4 py-2.5 text-ink"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-row-title">Äta ute: smak och allergier</span>
        <span className="block text-meta text-ink-2">Hushållets medlemmar och andra, sparat på den här enheten</span>
      </span>
      <ChevronRightIcon size={20} className="shrink-0 text-ink-3" />
    </Link>
  );
}

/** `members`: the household's members, read on the server (null = could not be read: only "Du" and those added by hand). */
export function ProfilesScreen({ members = null }: { members?: readonly HouseholdPerson[] | null }) {
  const enabled = useOption("menuAdvisor");
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const { people, save, remove } = usePeople(members);
  const [view, setView] = useState<View>({ name: "list" });
  if (!mounted) return null;
  if (!enabled) return <Notice>Menyrådgivaren är avstängd. Slå på den under Inställningar, Tillval.</Notice>;

  const current = view.name === "list" ? null : people.find((person) => person.id === view.id);
  if (view.name === "allergies" && current) {
    return <AllergiesView person={current} onChange={save} onBack={() => setView({ name: "person", id: current.id })} />;
  }
  if (view.name === "person" && current) {
    return (
      <PersonView
        person={current}
        onChange={save}
        onAllergies={() => setView({ name: "allergies", id: current.id })}
        onRemove={() => {
          remove(current.id);
          setView({ name: "list" });
        }}
        onBack={() => setView({ name: "list" })}
      />
    );
  }
  // The list; also where a person who was removed (or never there) ends up.
  return (
    <PeopleList
      people={people}
      onOpen={(id) => setView({ name: "person", id })}
      onAdd={(person) => {
        save(person);
        setView({ name: "person", id: person.id });
      }}
    />
  );
}

function summary(person: Person): string {
  const parts = [
    Object.keys(person.tastes).length > 0 || person.dislikes.length > 0 || person.likes.length > 0 ? "Smak ifylld" : "Äter allt",
    person.drink ? drinkLabels[person.drink] : null,
    person.allergies.length > 0 ? `Allergi: ${person.allergies.map((allergen) => allergenLabels[allergen].toLowerCase()).join(", ")}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

function PeopleList({ people, onOpen, onAdd }: { people: Person[]; onOpen: (id: string) => void; onAdd: (person: Person) => void }) {
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Person["kind"]>("member");
  return (
    <div className="flex flex-col gap-4" data-testid="menu-profiles">
      <p className="text-body text-ink-2">
        Hushållets medlemmar finns med här av sig själva. Fyll i det som gäller, en gång: resten räknas som allätare. Det sparas på den här enheten, så på en annan telefon fyller du i det igen.
      </p>
      <ul className="divide-y divide-border overflow-hidden rounded-lg bg-surface">
        {people.map((person) => (
          <li key={person.id}>
            <button
              type="button"
              data-testid="menu-profile-row"
              onClick={() => onOpen(person.id)}
              className="flex min-h-row w-full items-center gap-3 px-4 py-2.5 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-row-title">
                  {person.name}
                  {person.kind === "guest" ? <span className="ml-2 text-meta font-normal text-ink-2">Gäst</span> : null}
                </span>
                <span className="block text-meta text-ink-2">{summary(person)}</span>
              </span>
              <ChevronRightIcon size={20} className="shrink-0 text-ink-3" />
            </button>
          </li>
        ))}
      </ul>
      {adding ? (
        <form
          className="flex flex-col gap-2 rounded-lg bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() === "") return;
            onAdd(newPerson(makePersonId(), name, kind));
          }}
        >
          <label htmlFor={`${id}-name`} className="text-control text-ink">
            Namn
          </label>
          <Input id={`${id}-name`} data-testid="menu-person-name" value={name} maxLength={maxNameLength} autoFocus onChange={(event) => setName(event.target.value)} />
          <Segment<Person["kind"]>
            label="Vem är det?"
            value={kind}
            onChange={setKind}
            options={[
              { value: "member", label: "I hushållet" },
              { value: "guest", label: "Gäst" },
            ]}
          />
          <Button type="submit" disabled={name.trim() === ""}>
            Lägg till
          </Button>
        </form>
      ) : people.length >= maxPeople ? null : (
        <div className="flex flex-col gap-1">
          <Button variant="secondary" fullWidth data-testid="menu-person-add" onClick={() => setAdding(true)}>
            Lägg till person utan konto
          </Button>
          <p className="text-meta text-ink-3">T.ex. barn eller en vän. Sparas på den här telefonen.</p>
        </div>
      )}
    </div>
  );
}

function PersonView({
  person,
  onChange,
  onAllergies,
  onRemove,
  onBack,
}: {
  person: Person;
  onChange: (person: Person) => void;
  onAllergies: () => void;
  onRemove: () => void;
  onBack: () => void;
}) {
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  function addTo(list: "dislikes" | "likes", text: string): string | null {
    const result = withTag(person, list, text);
    if (result.error === null && result.person !== person) onChange(result.person);
    return result.error;
  }
  return (
    <div className="flex flex-col gap-5" data-testid="menu-profile">
      <Button variant="compact" onClick={onBack} className="self-start">
        Alla personer
      </Button>
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

      <section aria-labelledby={`${id}-taste`} className="flex flex-col gap-3">
        <div>
          <h3 id={`${id}-taste`} className="text-section-label text-ink-2 uppercase">
            Smak
          </h3>
          <p className="text-meta text-ink-3">Rör bara det du har en åsikt om. Inget ifyllt betyder att personen äter allt.</p>
        </div>
        <ul className="flex flex-col gap-3 rounded-lg bg-surface p-4">
          {tasteKeys.map((key) => (
            <li key={key} className="flex flex-col gap-1.5">
              <span className="text-control text-ink">{tasteLabels[key]}</span>
              <Segment
                label={tasteLabels[key]}
                value={String(person.tastes[key] ?? 0)}
                onChange={(value) => onChange(withTaste(person, key, Number(value) as Taste))}
                options={tasteOptions}
              />
            </li>
          ))}
        </ul>
      </section>

      <PreferenceSection
        testId="menu-dislikes"
        title="Undviker"
        hint="Det du helst slipper, som koriander eller vitlök. Rätterna får en markering och föreslås inte i första hand."
        inputLabel="Lägg till något du undviker"
        tags={person.dislikes}
        suggestions={dislikeSuggestions}
        onAdd={(text) => addTo("dislikes", text)}
        onRemove={(tag) => onChange(withoutTag(person, "dislikes", tag))}
      />

      <PreferenceSection
        testId="menu-likes"
        title="Älskar"
        hint="Det du gärna äter, som paprika eller nasi goreng. Sådana rätter föreslås oftare."
        inputLabel="Lägg till något du älskar"
        tags={person.likes}
        suggestions={likeSuggestions}
        onAdd={(text) => addTo("likes", text)}
        onRemove={(tag) => onChange(withoutTag(person, "likes", tag))}
      />

      <p className="rounded-md bg-fill px-3 py-2 text-meta text-ink-2">Allergier = får aldrig föreslås. Undviker = föreslås inte i första hand.</p>

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

      {isHouseholdPerson(person) ? (
        <p className="text-meta text-ink-3">Sparas på den här enheten. Du fyller i det en gång.</p>
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
        <Button variant="danger" className="self-start" onClick={() => setConfirming(true)}>
          Ta bort {person.name}
        </Button>
      )}
    </div>
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
