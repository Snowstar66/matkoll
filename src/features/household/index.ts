// Client-safe entry: types and domain (Story 21.2b).
export {
  formatInviteCode,
  inviteCodeAlphabet,
  inviteCodeLength,
  inviteLink,
  inviteShareText,
  inviteValidUntil,
  isInviteCodeShape,
  joinRoute,
  normalizeInviteCode,
} from "./domain/invite-code";
export {
  cleanName,
  heirOf,
  householdNameMaxLength,
  initialOf,
  isMemberColor,
  memberColors,
  memberCountText,
  memberNameMaxLength,
  memberNamesText,
  type Household,
  type Me,
  type Member,
  type MemberColor,
  type PendingInvite,
} from "./domain/member";
