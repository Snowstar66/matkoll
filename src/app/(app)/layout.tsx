import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { ToastProvider } from "@/components/toast";
import { AiJobRow } from "@/features/ai-jobs/ui/ai-job-row";
import { AiJobsProvider } from "@/features/ai-jobs/ui/ai-jobs-provider";

// The signed-in part of the app. The layout never awaits the session (AD-18): each
// page checks it with requireUserOrRedirect inside <Suspense>, and the proxy has
// already sent requests without a session to /logga-in. Story 12.4: the AI jobs
// (their polling, the sheet and the confirmations) live here, and their job row
// is part of the shell, above the tabs and in the side menu.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AiJobsProvider>
        <AppShell jobRows={{ bar: <AiJobRow variant="bar" />, side: <AiJobRow variant="side" /> }}>{children}</AppShell>
      </AiJobsProvider>
    </ToastProvider>
  );
}
