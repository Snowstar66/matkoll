"use client";

import { useEffect } from "react";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";

// Unexpected errors inside the app shell: the menu stays, the surface shows a notice.
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    // Error code only, no user data (logging convention).
    const digest = typeof error === "object" && error && "digest" in error ? String(error.digest) : "";
    console.error("app_error", digest);
  }, [error]);

  return (
    <div className="pt-[max(var(--header-top-mobile),calc(env(safe-area-inset-top)+12px))] desktop:pt-10">
      <Notice
        role="alert"
        action={
          <Button variant="text" onClick={() => retry()}>
            Försök igen
          </Button>
        }
      >
        Något gick fel. Försök igen.
      </Notice>
    </div>
  );
}
