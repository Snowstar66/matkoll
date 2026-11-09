import { useEffect, useState } from "react";
import type { HouseholdPerson } from "@/features/menu-advisor";
import type { Person } from "@/features/menu-advisor/domain/profile";
import { ProfileGroups } from "@/features/menu-advisor/ui/profile-groups";
import { ProfilesScreen } from "@/features/menu-advisor/ui/profiles-screen";

// Component tests stand in for the two routes (Medlemmar and the page of one person) with one tree. The tests mock
// "next/link" (a click dispatches `navigateEvent` with the href) and "next/navigation" (push does the same); this
// component listens and switches between the list and the person's page. (The mocks are written in each test file:
// a mock factory that imports this file would import the mocked modules while they are being made.)

export const navigateEvent = "test-navigate";

/** The list (ProfileGroups) until a person's link is followed, then that person's page; a route back shows the list. */
export function ProfilesPages({ members, profiles }: { members?: readonly HouseholdPerson[] | null; profiles?: Person[] | null }) {
  const [personId, setPersonId] = useState<string | null>(null);
  useEffect(() => {
    const listener = (event: Event) => {
      const href = String((event as CustomEvent<string>).detail);
      const person = new URL(href, "http://localhost").searchParams.get("person");
      setPersonId(person);
    };
    window.addEventListener(navigateEvent, listener);
    return () => window.removeEventListener(navigateEvent, listener);
  }, []);
  return personId === null ? (
    <ProfileGroups members={members} profiles={profiles} />
  ) : (
    <ProfilesScreen personId={personId} members={members} profiles={profiles} backHref="/installningar/medlemmar" />
  );
}
