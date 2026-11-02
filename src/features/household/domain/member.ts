// Who is in the household (Story 21.2b), as the app shows it. Client-safe.

/** Decision 7: a shade per member, mint, sky, sand, lila in the order they joined. */
export const memberColors = ["mint", "sky", "sand", "lila"] as const;
export type MemberColor = (typeof memberColors)[number];

export type Member = {
  userId: string;
  name: string;
  email: string;
  role: "owner" | "member";
  color: MemberColor;
  joinedAt: string;
  /** Whether the person has said what they are called ("Vad heter du?" is asked while false). */
  named: boolean;
  isMe: boolean;
};

export type PendingInvite = {
  id: string;
  createdByName: string | null;
  createdAt: string;
  expiresAt: string;
};

export type Household = {
  name: string;
  members: Member[];
  invites: PendingInvite[];
};

/** The signed-in person as a member: what the P button, the side menu and the name prompt show. */
export type Me = { name: string; color: MemberColor; named: boolean };

export function isMemberColor(value: unknown): value is MemberColor {
  return typeof value === "string" && (memberColors as readonly string[]).includes(value);
}

/** "P": the first letter of a name, for the round avatar. */
export function initialOf(name: string): string {
  return name.trim().charAt(0).toLocaleUpperCase("sv-SE") || "?";
}

/** The longest a member's name may be (household_member.display_name). */
export const memberNameMaxLength = 40;

/** The longest a household's name may be (household.name). */
export const householdNameMaxLength = 60;

/** A name as it is saved: inner spaces folded, trimmed. */
export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** "Pontus, Martina": the value of the Medlemmar row on the start page of Inställningar. */
export function memberNamesText(members: readonly Pick<Member, "name">[]): string {
  return members.map((member) => member.name).join(", ");
}

/** "1 medlem", "2 medlemmar". */
export function memberCountText(count: number): string {
  return `${count} ${count === 1 ? "medlem" : "medlemmar"}`;
}

/** Who becomes owner when the owner leaves: the one who has been there longest (the database decides the same). */
export function heirOf(members: readonly Member[]): Member | null {
  const others = members.filter((member) => !member.isMe);
  return [...others].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.userId.localeCompare(b.userId))[0] ?? null;
}
