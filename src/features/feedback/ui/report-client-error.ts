"use client";

import { reportError } from "../actions/report-error";
import { createReportGate, type ErrorSource, isIgnorableError, rawErrorOf, reportKey } from "../domain/error-report";

// The browser's side of the automatic error reports: skips what is expected, sends
// each error once per page load (same message or digest and path), stops at a cap,
// and swallows every failure of its own, so reporting can never throw or loop.

const gate = createReportGate();
let reporting = false;

/** Reports something that was thrown, unless it is expected or already reported. Never throws. */
export function reportClientError(thrown: unknown, source: ErrorSource): void {
  // An error while reporting is never reported (no loop).
  if (reporting) return;
  try {
    const error = rawErrorOf(thrown);
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    if (isIgnorableError(error, { online })) return;
    const path = window.location.pathname;
    if (!gate.allow(reportKey(error, path))) return;
    reporting = true;
    void reportError({ ...error, path, source })
      .catch(() => {})
      .finally(() => {
        reporting = false;
      });
  } catch {
    reporting = false;
  }
}
