"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/button";
import { Input } from "@/components/field";
import { ChevronRightIcon, PlusIcon } from "@/components/icons";
import { ListGroup } from "@/components/list-group";
import { Segment } from "@/components/segment";
import { type HouseholdPerson, isHouseholdPerson, maxNameLength, maxPeople, newPerson, profileHref, profileSummary } from "../domain/people";
import type { Person } from "../domain/profile";
import { makePersonId, usePeople } from "./use-people";

/**
 * Smak och allergies on Inställningar → Medlemmar: one row per household member ("Du" first) with what is filled in
 * in one short line, and under "Utan konto" the people kept by hand (children, friends, saved guests) with "Lägg till
 * person". A row opens that person's page. Saved for the household; does not need the Menyrådgivare option.
 * `members` / `profiles`: as read on the server (null = could not be read).
 */
export function ProfileGroups({ members = null, profiles = null }: { members?: readonly HouseholdPerson[] | null; profiles?: Person[] | null }) {
  const { people, save, notice } = usePeople(members, profiles);
  const memberRows = people.filter(isHouseholdPerson);
  const guests = people.filter((person) => !isHouseholdPerson(person));
  return (
    <section id="smak-och-allergier" aria-labelledby="profiles-heading" data-testid="menu-profiles" className="mt-6 flex scroll-mt-4 flex-col gap-2">
      <h2 id="profiles-heading" className="px-4 text-meta font-medium text-ink-2">
        Smak och allergier
      </h2>
      <PersonRows people={memberRows} label="Medlemmar" />
      <p className="mx-1 text-meta text-ink-2">
        Styr förslag och markeringar i hela appen. Allergier = får aldrig föreslås. Undviker = föreslås inte i första hand. Sparas för hushållet och alla i hushållet kan ändra.
      </p>

      <h3 id="utan-konto" className="mt-4 scroll-mt-4 px-4 text-meta font-medium text-ink-2">
        Utan konto
      </h3>
      {guests.length > 0 ? <PersonRows people={guests} labelledBy="utan-konto" /> : null}
      <AddPerson full={people.length >= maxPeople} onAdd={save} />
      <p className="mx-1 text-meta text-ink-3">T.ex. barn eller en vän. Sparas för hushållet.</p>
      {notice ? (
        <p data-testid="menu-profiles-notice" role="status" className="text-meta text-ink-3">
          {notice}
        </p>
      ) : null}
    </section>
  );
}

function PersonRows({ people, label, labelledBy }: { people: readonly Person[]; label?: string; labelledBy?: string }) {
  return (
    <ListGroup label={label} labelledBy={labelledBy}>
      {people.map((person) => (
        <li key={person.id}>
          <Link href={profileHref(person.id)} data-testid="menu-profile-row" className="flex min-h-16 items-center gap-3 py-2 pr-3 pl-4 focus-visible:-outline-offset-2">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-row-title font-normal text-ink">
                {person.name}
                {person.kind === "guest" ? <span className="ml-2 text-meta text-ink-2">Gäst</span> : null}
              </span>
              <span className="truncate text-meta text-ink-2" data-testid="menu-profile-summary">
                {profileSummary(person)}
              </span>
            </span>
            <ChevronRightIcon size={16} className="shrink-0 text-ink-3" />
          </Link>
        </li>
      ))}
    </ListGroup>
  );
}

function AddPerson({ full, onAdd }: { full: boolean; onAdd: (person: Person) => void }) {
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Person["kind"]>("member");
  if (full) return null;
  if (!adding) {
    return (
      <ListGroup label="Lägg till person">
        <li>
          <button
            type="button"
            data-testid="menu-person-add"
            onClick={() => setAdding(true)}
            className="flex min-h-[52px] w-full items-center gap-3 py-2 pr-2 pl-4 text-left text-accent focus-visible:-outline-offset-2"
          >
            <span className="flex w-6 justify-center">
              <PlusIcon size={22} />
            </span>
            <span className="text-row-title">Lägg till person</span>
          </button>
        </li>
      </ListGroup>
    );
  }
  return (
    <form
      className="flex flex-col gap-2 rounded-lg bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim() === "") return;
        onAdd(newPerson(makePersonId(), name, kind));
        setName("");
        setAdding(false);
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
      <div className="flex gap-2">
        <Button type="submit" disabled={name.trim() === ""}>
          Lägg till
        </Button>
        <Button type="button" variant="quiet" onClick={() => setAdding(false)}>
          Avbryt
        </Button>
      </div>
    </form>
  );
}
