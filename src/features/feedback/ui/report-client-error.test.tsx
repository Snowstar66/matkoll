import { beforeEach, describe, expect, it, vi } from "vitest";

// The browser's reporter: expected errors are skipped, the same error is sent once,
// and a failing report never throws.

const reportError = vi.fn<(input: unknown) => Promise<void>>();
vi.mock("../actions/report-error", () => ({ reportError: (input: unknown) => reportError(input) }));

let reportClientError: typeof import("./report-client-error").reportClientError;
let online = true;

beforeEach(async () => {
  vi.resetModules();
  reportError.mockReset();
  reportError.mockResolvedValue();
  online = true;
  vi.stubGlobal("navigator", { get onLine() { return online; } });
  ({ reportClientError } = await import("./report-client-error"));
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("reportClientError", () => {
  it("sends name, message, digest, the path without query and the source", async () => {
    window.history.pushState({}, "", "/recept?q=kyckling");
    reportClientError(Object.assign(new TypeError("boom"), { digest: "42" }), "boundary");
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ name: "TypeError", message: "boom", digest: "42", path: "/recept", source: "boundary" }));
  });

  it("sends the same error once, even when it comes again after the first report finished", async () => {
    reportClientError(new Error("boom"), "window");
    await flush();
    reportClientError(new Error("boom"), "rejection");
    await flush();
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it("skips expected errors, and network errors only while offline", async () => {
    reportClientError(new Error("NEXT_REDIRECT"), "boundary");
    reportClientError(Object.assign(new Error("aborted"), { name: "AbortError" }), "rejection");
    online = false;
    reportClientError(new TypeError("Failed to fetch"), "rejection");
    expect(reportError).not.toHaveBeenCalled();
    online = true;
    reportClientError(new TypeError("Failed to fetch"), "rejection");
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it("never throws, when the report fails or when what was thrown is odd", async () => {
    reportError.mockRejectedValue(new Error("down"));
    expect(() => reportClientError(new Error("a"), "window")).not.toThrow();
    await flush();
    expect(() => reportClientError(null, "window")).not.toThrow();
    expect(() => reportClientError({ get message(): string { throw new Error("x"); } }, "window")).not.toThrow();
  });
});
