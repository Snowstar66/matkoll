"use client";

import { useEffect } from "react";
import { isForeignScript, rawErrorOf } from "../domain/error-report";
import { reportClientError } from "./report-client-error";

/**
 * Listens for errors nothing caught in the browser (window `error` and
 * `unhandledrejection`) and reports them to the owner's inbox. Renders nothing; sits
 * once in the (app) layout. The error boundaries report their own.
 */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const thrown = event.error ?? { name: "Error", message: event.message };
      // Extensions and scripts from other sites are not the app's errors.
      if (isForeignScript(event.filename, rawErrorOf(thrown).stack, window.location.origin)) return;
      reportClientError(thrown, "window");
    };
    const onRejection = (event: PromiseRejectionEvent) => reportClientError(event.reason, "rejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
