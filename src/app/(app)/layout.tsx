import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { ToastProvider } from "@/components/toast";
import { AiJobRow } from "@/features/ai-jobs/ui/ai-job-row";
import { SavedImports } from "@/features/recipes/ui/saved-imports";
import { PrivacyNote } from "@/features/auth/ui/privacy-note";
import { AiJobsProvider } from "@/features/ai-jobs/ui/ai-jobs-provider";

// The signed-in part of the app. The layout never awaits the session (AD-18): each
// page checks it with requireUserOrRedirect inside <Suspense>, and the proxy has
// already sent requests without a session to /logga-in. Story 12.4: the AI jobs
// (their polling, the sheet and the confirmations) live here, and their job row
// is part of the shell, above the tabs and in the side menu. Story 17.2: the
// one-time privacy note sits above every page until Okej is pressed on the device.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AiJobsProvider>
        <SavedImports />
        <AppShell jobRows={{ bar: <AiJobRow variant="bar" />, side: <AiJobRow variant="side" /> }}>
          <PrivacyNote />
          {children}
        </AppShell>
      </AiJobsProvider>
    </ToastProvider>
  );
}
