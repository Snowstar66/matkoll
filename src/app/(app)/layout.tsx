import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { ToastProvider } from "@/components/toast";

// The signed-in part of the app. The layout never awaits the session (AD-18): each
// page checks it with requireUserOrRedirect inside <Suspense>, and the proxy has
// already sent requests without a session to /logga-in.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AppShell>{children}</AppShell>
    </ToastProvider>
  );
}
