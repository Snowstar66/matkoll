import { type ReactNode, Suspense } from "react";
import { AccountProvider } from "@/components/app-shell/account";
import { AppShell } from "@/components/app-shell/app-shell";
import { ToastProvider } from "@/components/toast";
import { AiJobRow } from "@/features/ai-jobs/ui/ai-job-row";
import { SavedImports } from "@/features/recipes/ui/saved-imports";
import { accountOf } from "@/features/auth";
import { getCurrentUser } from "@/features/auth/server";
import { initialOf } from "@/features/household";
import { getMe } from "@/features/household/server";
import { SignOutButton } from "@/features/auth/ui/sign-out-button";
import { AiJobsProvider } from "@/features/ai-jobs/ui/ai-jobs-provider";
import { addToCurrentPlan } from "@/features/mealplan/server";
import { NotesProvider } from "@/features/notes/ui/notes-provider";
import type { PantrySite } from "@/features/pantry";
import { listPantrySites, PantryDataError } from "@/features/pantry/server";
import { BoendeVal } from "@/features/pantry/ui/boende-val";
import { SiteSwitchProvider } from "@/features/pantry/ui/site-switching";
import { hasSeenWelcomeTour } from "@/features/welcome/server";
import { loadBoendeCounts } from "./boende-counts";
import { type NameAsk, WelcomeGate } from "./welcome-gate";

/**
 * The boende button in the side menu (Story 16.14), read inside its own
 * <Suspense> so the shell never waits for it (AD-18). Nothing with one boende,
 * or when the boenden cannot be read or there is no session.
 */
async function SideBoende() {
  let sites: PantrySite[];
  try {
    sites = await listPantrySites();
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    return null;
  }
  return <BoendeVal variant="side" sites={sites} loadCounts={loadBoendeCounts} />;
}

// The signed-in part of the app. The layout never awaits the session (AD-18): each
// page checks it with requireUserOrRedirect inside <Suspense>, and the proxy has
// already sent requests without a session to /logga-in. Story 12.4: the AI jobs
// (their polling, the sheet and the confirmations) live here, and their job row
// is part of the shell, above the tabs and in the side menu. Story 17.2: the
// one-time privacy note sits above every page until Okej is pressed on the device.
// Story 20.1: the first time, the welcome tour comes first (WelcomeGate), and the
// note only after it. Story 24.1: a note from someone in the household lies under each tab's title.
export default function AppLayout({ children }: { children: ReactNode }) {
  // Story 19.2: the P button and the side menu show who is signed in. The promise, not the session, goes down (AD-18).
  // Story 21.2b: the person's own name and shade in the household (decision 4), the address's first part until known.
  const signedIn = getCurrentUser()
    .then(async (user) => (user ? { user, me: await getMe() } : null))
    .catch(() => null);
  const account = signedIn.then((current) => {
    if (!current) return null;
    const fallback = accountOf(current.user.email);
    if (!current.me) return fallback;
    return { name: current.me.name, email: fallback.email, initial: initialOf(current.me.name), tone: current.me.color };
  });
  // Story 20.1: whether to leave the welcome tour out; a promise, read inside WelcomeGate's <Suspense>.
  const welcomeSeen = hasSeenWelcomeTour().catch(() => true);
  // Story 21.2b: "Vad heter du?" while the person has not said their name.
  const nameAsk: Promise<NameAsk> = signedIn.then((current) =>
    current?.me && !current.me.named ? { suggested: current.me.name, tone: current.me.color } : null,
  );
  return (
    <AccountProvider
      account={account}
      signOut={{ sheet: <SignOutButton appearance="sheet" />, menu: <SignOutButton appearance="menu" /> }}
    >
    <ToastProvider>
      <AiJobsProvider>
        <SavedImports />
        {/* Story 24.1: the household's notes, read by the client (the layout never waits for them), under each tab's title. */}
        <NotesProvider addToPlan={addToCurrentPlan}>
        {/* Story 16.14: the boende is selected in the side menu or under the page title, so what waits while it is saved is above both. */}
        <SiteSwitchProvider>
          <AppShell
            jobRows={{ bar: <AiJobRow variant="bar" />, side: <AiJobRow variant="side" /> }}
            siteSwitch={
              <Suspense fallback={null}>
                <SideBoende />
              </Suspense>
            }
          >
            <Suspense fallback={null}>
              <WelcomeGate seen={welcomeSeen} name={nameAsk} />
            </Suspense>
            {children}
          </AppShell>
        </SiteSwitchProvider>
        </NotesProvider>
      </AiJobsProvider>
    </ToastProvider>
    </AccountProvider>
  );
}
