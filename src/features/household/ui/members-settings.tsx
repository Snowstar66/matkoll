"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Avatar } from "@/components/app-shell/avatar";
import { Button } from "@/components/button";
import { useConfirmDelete } from "@/components/confirm-delete";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { ChevronRightIcon, LinkIcon, PlusIcon } from "@/components/icons";
import { ListGroup } from "@/components/list-group";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { TrashButton } from "@/components/trash-button";
import { errorMessages } from "@/lib/errors";
import { createInvite, leaveHousehold, makeOwner, removeMember, renameHousehold, setInviteRevoked } from "../actions/members";
import { formatInviteCode, inviteValidUntil } from "../domain/invite-code";
import { heirOf, householdNameMaxLength, initialOf, type Household, type Member, memberCountText } from "../domain/member";
import { inviteCodesFor, readInviteCodesRaw, rememberInviteCode, subscribeInviteCodes } from "./invite-codes";
import { InviteSheet, type ShownInvite } from "./invite-sheet";

/** The small grey label after a name, like "Egen" in the list: "Du", "Ägare". */
function Tag({ children }: { children: string }) {
  return <span className="ml-1.5 inline-block rounded-xs bg-border px-1.5 py-px align-[2px] text-badge text-ink-2">{children}</span>;
}

const rowClasses = "flex min-h-16 items-center gap-3 py-2 pr-2 pl-4";

/**
 * Inställningar → Hushåll → Medlemmar (Story 21.2b; the mockup hushallet.html, sections 1 and 3).
 * The household's name in a row at the top (renamed in a sheet); a row per member with the initial
 * in their shade, the name, the tags Du and Ägare and the address; the open invitations; "Bjud in
 * någon"; and "Lämna hushållet" in red at the bottom when someone else is in the household. The
 * owner has a trash on the others' rows, and a member's sheet with "Gör till ägare". Removing,
 * leaving and handing over ask first and cannot be undone; an invitation goes at once with "Ångra".
 */
export function MembersSettings({ household, siteUrl, appName }: { household: Household; siteUrl: string; appName: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { showToast } = useToast();
  const { requestDelete, dialog } = useConfirmDelete();
  const [, startTransition] = useTransition();
  const [shown, setShown] = useState<ShownInvite | null>(null);
  const [inviting, setInviting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [chosen, setChosen] = useState<Member | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const left = useRef(false);

  const me = household.members.find((member) => member.isMe);
  const isOwner = me?.role === "owner";
  const others = household.members.filter((member) => !member.isMe);
  const invites = household.invites.filter((invite) => !hidden.includes(invite.id));
  const openIds = household.invites.map((invite) => invite.id).join(",");
  const storedCodes = useSyncExternalStore(subscribeInviteCodes, readInviteCodesRaw, () => "");
  const codes = useMemo(() => inviteCodesFor(storedCodes, openIds ? openIds.split(",") : []), [storedCodes, openIds]);

  // After "Lämna hushållet", the page of the new household says so once.
  useEffect(() => {
    if (left.current || params.get("lamnat") === null) return;
    left.current = true;
    showToast("Du har lämnat hushållet.");
    router.replace("/installningar/medlemmar", { scroll: false });
  }, [params, router, showToast]);

  const refresh = () => startTransition(() => router.refresh());

  async function invite() {
    if (inviting) return;
    setInviting(true);
    try {
      const made = await createInvite();
      if (!made.ok) {
        showToast(made.error.message, { role: "alert" });
        return;
      }
      rememberInviteCode(made.data.id, made.data.code);
      setShown(made.data);
      refresh();
    } catch {
      showToast(errorMessages.household_failed, { role: "alert" });
    } finally {
      setInviting(false);
    }
  }

  async function revoke(id: string) {
    setShown(null);
    setHidden((current) => [...current, id]);
    const done = await setInviteRevoked({ inviteId: id }).catch(() => null);
    if (!done?.ok) {
      setHidden((current) => current.filter((other) => other !== id));
      showToast(done?.ok === false ? done.error.message : errorMessages.household_failed, { role: "alert" });
      return;
    }
    showToast("Tog bort inbjudan.", {
      onUndo: async () => {
        const back = await setInviteRevoked({ inviteId: id, restore: true }).catch(() => null);
        if (back?.ok && back.data) setHidden((current) => current.filter((other) => other !== id));
        else showToast("Det gick inte att ångra.", { role: "alert" });
        refresh();
      },
      onClose: refresh,
    });
  }

  function askRemove(member: Member) {
    setChosen(null);
    requestDelete({
      question: `Ta bort ${member.name} ur hushållet?`,
      detail: `${member.name} ser inte längre er data och får ett eget, tomt hushåll. Det ${member.name} har lagt in stannar här.`,
      onConfirm: async () => {
        const done = await removeMember({ userId: member.userId }).catch(() => null);
        if (!done?.ok) {
          showToast(done?.ok === false ? done.error.message : errorMessages.household_failed, { role: "alert" });
          return;
        }
        showToast(`${member.name} är inte längre med i hushållet.`);
        refresh();
      },
    });
  }

  function askOwner(member: Member) {
    setChosen(null);
    requestDelete({
      question: `Gör ${member.name} till ägare?`,
      detail: `${member.name} blir hushållets ägare och du en vanlig medlem.`,
      confirmLabel: "Gör till ägare",
      onConfirm: async () => {
        const done = await makeOwner({ userId: member.userId }).catch(() => null);
        if (!done?.ok) {
          showToast(done?.ok === false ? done.error.message : errorMessages.household_failed, { role: "alert" });
          return;
        }
        showToast(`${member.name} är ägare nu.`);
        refresh();
      },
    });
  }

  function askLeave() {
    const heir = isOwner ? heirOf(household.members) : null;
    requestDelete({
      question: `Lämna ${household.name}?`,
      detail: `Du ser inte längre recepten, listan och förrådet här, och får ett eget, tomt hushåll. Tillbaka kommer du med en ny inbjudan.${heir ? ` ${heir.name} blir ägare.` : ""}`,
      confirmLabel: "Lämna",
      onConfirm: async () => {
        // A redirect is the answer when it works.
        const done = await leaveHousehold().catch(() => null);
        if (done && !done.ok) showToast(done.error.message, { role: "alert" });
        else if (!done) refresh();
      },
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <ListGroup label="Hushållets namn" className="mt-2">
        <li>
          <button type="button" onClick={() => setRenaming(true)} className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left focus-visible:-outline-offset-2">
            <span className="flex-1 text-row-title font-normal text-ink">Namn</span>
            <span className="max-w-[60%] truncate text-[15px] leading-5 text-ink-2" data-testid="household-name">
              {household.name}
            </span>
            <ChevronRightIcon size={16} className="-mr-1 shrink-0 text-ink-3" />
          </button>
        </li>
      </ListGroup>

      <h2 id="members-heading" className="mt-4 px-4 text-meta font-medium text-ink-2">
        {memberCountText(household.members.length)}
      </h2>
      <ListGroup labelledBy="members-heading" inset={68} data-testid="members">
        {household.members.map((member) => {
          const canManage = isOwner && !member.isMe;
          const body = (
            <>
              <Avatar initial={initialOf(member.name)} size={40} tone={member.color} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-row-title font-normal text-ink">
                  {member.name}
                  {member.isMe ? <Tag>Du</Tag> : null}
                  {member.role === "owner" ? <Tag>Ägare</Tag> : null}
                </span>
                <span className="truncate text-meta text-ink-2">{member.email}</span>
              </span>
            </>
          );
          return (
            <li key={member.userId} className={rowClasses} data-testid="member-row">
              {canManage ? (
                <button type="button" onClick={() => setChosen(member)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`${member.name}, ${member.email}`}>
                  {body}
                </button>
              ) : (
                <span className="flex min-w-0 flex-1 items-center gap-3">{body}</span>
              )}
              {canManage ? <TrashButton label={`Ta bort ${member.name} ur hushållet`} onPress={() => askRemove(member)} /> : <span className="w-2" />}
            </li>
          );
        })}
        {invites.map((pending) => {
          const code = codes[pending.id];
          return (
            <li key={pending.id} className={rowClasses} data-testid="invite-row">
              <button
                type="button"
                onClick={() => (code ? setShown({ id: pending.id, code, expiresAt: pending.expiresAt }) : undefined)}
                disabled={!code}
                className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
              >
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-border text-ink-3">
                  <LinkIcon size={20} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-row-title font-normal text-ink">
                    Inbjudan{code ? <span className="ml-1.5 font-mono tracking-[1px]">{formatInviteCode(code)}</span> : null}
                  </span>
                  <span className="truncate text-meta text-ink-2">
                    Gäller till {inviteValidUntil(pending.expiresAt)}
                    {!code && pending.createdByName ? ` · från ${pending.createdByName}` : ""}
                  </span>
                </span>
              </button>
              <TrashButton label="Ta bort inbjudan" onPress={() => void revoke(pending.id)} />
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => void invite()}
            disabled={inviting}
            className="flex min-h-[52px] w-full items-center gap-3 py-2 pr-2 pl-4 text-left text-accent focus-visible:-outline-offset-2"
            data-testid="invite-someone"
          >
            <span className="flex w-10 justify-center">
              <PlusIcon size={22} />
            </span>
            <span className="text-row-title">Bjud in någon</span>
          </button>
        </li>
      </ListGroup>
      <p className="mx-1 text-meta text-ink-2">Alla i hushållet ser och ändrar samma recept, matsedel, lista, matvaror och förråd.</p>

      {others.length > 0 ? (
        <Button variant="danger" fullWidth className="mt-4" onClick={askLeave} data-testid="leave-household">
          Lämna hushållet
        </Button>
      ) : null}

      <InviteSheet
        invite={shown}
        onClose={() => setShown(null)}
        onRevoke={(open) => void revoke(open.id)}
        siteUrl={siteUrl}
        inviter={me?.name ?? ""}
        household={household.name}
        appName={appName}
      />
      <MemberSheet member={chosen} onClose={() => setChosen(null)} onOwner={askOwner} onRemove={askRemove} />
      <RenameSheet open={renaming} current={household.name} onClose={() => setRenaming(false)} onSaved={refresh} />
      {dialog}
    </div>
  );
}

/** A member's sheet, for the owner: "Gör till ägare" and "Ta bort ur hushållet". */
function MemberSheet({ member, onClose, onOwner, onRemove }: { member: Member | null; onClose: () => void; onOwner: (member: Member) => void; onRemove: (member: Member) => void }) {
  const [last, setLast] = useState<Member | null>(member);
  if (member && member !== last) setLast(member);
  const shown = member ?? last;
  return (
    <Sheet open={member !== null} onClose={onClose} title={shown?.name ?? ""} subtitle={shown?.email} closeLabel="Klar">
      {shown ? (
        <ul role="list" className="mt-1 flex flex-col divide-y divide-hairline overflow-hidden rounded-[14px] bg-fill">
          <li>
            <button type="button" onClick={() => onOwner(shown)} className="flex min-h-[52px] w-full items-center px-4 text-left text-row-title text-ink">
              Gör till ägare
            </button>
          </li>
          <li>
            <button type="button" onClick={() => onRemove(shown)} className="flex min-h-[52px] w-full items-center px-4 text-left text-row-title text-danger">
              Ta bort ur hushållet
            </button>
          </li>
        </ul>
      ) : null}
    </Sheet>
  );
}

/** "Hushållets namn": any member renames the household. */
function RenameSheet({ open, current, onClose, onSaved }: { open: boolean; current: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fieldId = useId();
  const errorId = useId();
  const { showToast } = useToast();
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(current);
      setError(null);
    }
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    setPending(true);
    try {
      const saved = await renameHousehold({ name });
      if (!saved.ok) {
        setError(saved.error.fields?.name ?? saved.error.message);
        return;
      }
      showToast("Sparade namnet.");
      onSaved();
      onClose();
    } catch {
      setError(errorMessages.household_failed);
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Hushållets namn"
      closeLabel="Avbryt"
      isDirty={name !== current}
      footer={
        <Button fullWidth onClick={() => void save()} disabled={pending}>
          Spara
        </Button>
      }
    >
      <form onSubmit={save} noValidate className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={fieldId}>Namn</FieldLabel>
        <Input
          id={fieldId}
          value={name}
          maxLength={householdNameMaxLength}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      </form>
    </Sheet>
  );
}
