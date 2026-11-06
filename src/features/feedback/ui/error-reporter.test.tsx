import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorReporter } from "./error-reporter";

// The window listeners: an unhandled error and an unhandled rejection are reported, once installed and not after unmount.

const reportClientError = vi.fn<(thrown: unknown, source: string) => void>();
vi.mock("./report-client-error", () => ({ reportClientError: (thrown: unknown, source: string) => reportClientError(thrown, source) }));

beforeEach(() => reportClientError.mockReset());

// jsdom (and so Vitest) treats a dispatched error event as an uncaught exception unless it is handled.
const swallow = (event: ErrorEvent) => event.preventDefault();

describe("ErrorReporter", () => {
  it("reports window errors and unhandled rejections, and stops when unmounted", () => {
    window.addEventListener("error", swallow);
    const { unmount } = render(<ErrorReporter />);
    const error = new Error("boom");
    window.dispatchEvent(new ErrorEvent("error", { error, message: "boom" }));
    expect(reportClientError).toHaveBeenCalledWith(error, "window");

    const reason = new Error("nej");
    const rejection = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.defineProperty(rejection, "reason", { value: reason });
    window.dispatchEvent(rejection);
    expect(reportClientError).toHaveBeenCalledWith(reason, "rejection");

    unmount();
    window.dispatchEvent(new ErrorEvent("error", { error, message: "boom" }));
    window.removeEventListener("error", swallow);
    expect(reportClientError).toHaveBeenCalledTimes(2);
  });
});
