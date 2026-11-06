"use client";

import { useEffect } from "react";
import { reportClientError } from "@/features/feedback/ui/report-client-error";
import "./globals.css";

// Errors in the root layout itself: replaces the whole document, so it brings its own
// <html>, <body> and styles. The error also goes to the owner's inbox.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    reportClientError(error, "boundary");
  }, [error]);

  return (
    <html lang="sv" className="h-full antialiased">
      <body className="flex min-h-full flex-col items-start gap-3 p-6 text-body">
        <title>Något gick fel</title>
        <p role="alert">Något gick fel. Försök igen.</p>
        <button type="button" onClick={() => retry()} className="text-accent underline">
          Försök igen
        </button>
      </body>
    </html>
  );
}
