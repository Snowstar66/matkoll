"use client";

import { createContext, type ReactNode, use, useContext, useMemo } from "react";

// The account the P button, the avatar sheet and the side menu show (Story
// 19.2). The layout never awaits the session (AD-18), so it hands over the
// promise of it: whoever shows the account reads it with use() inside its own
// <Suspense>, and the shell is never held up.

/** What the avatar, the sheet and the side menu show of the account. */
export type AccountInfo = {
  /** "Pontus". */
  name: string;
  email: string;
  /** "P". */
  initial: string;
};

/** "Logga ut" is the auth module's button: the layout gives it, since shared code never imports a module (AD-1). */
export type SignOutSlots = { sheet: ReactNode; menu: ReactNode };

type AccountValue = { account: Promise<AccountInfo | null>; signOut: SignOutSlots };

const AccountContext = createContext<AccountValue | null>(null);

export function AccountProvider({
  account,
  signOut,
  children,
}: {
  account: Promise<AccountInfo | null>;
  signOut: SignOutSlots;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ account, signOut }), [account, signOut]);
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

/** Whether an account will be given at all (a provider above); the answer itself comes from `useAccount`. */
export function useHasAccount(): boolean {
  return useContext(AccountContext) !== null;
}

/** "Logga ut" for the sheet and the menu; nothing without a provider. */
export function useSignOutSlots(): SignOutSlots | null {
  return useContext(AccountContext)?.signOut ?? null;
}

/** The account, or `null` when it is not known. Suspends until it is read: needs a <Suspense> above. */
export function useAccount(): AccountInfo | null {
  const value = useContext(AccountContext);
  return value ? use(value.account) : null;
}
