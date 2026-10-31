import { describe, expect, it } from "vitest";
import { readBodyText } from "./read-body";

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request("http://localhost/x", { method: "POST", body, headers });

describe("readBodyText", () => {
  it("reads a body within the cap", async () => {
    expect(await readBodyText(post("mjölk"), 100)).toBe("mjölk");
  });

  it("counts bytes, not characters", async () => {
    expect(await readBodyText(post("ö".repeat(6)), 10)).toBeNull();
    expect(await readBodyText(post("ö".repeat(5)), 10)).toBe("ö".repeat(5));
  });

  it("refuses from content-length before reading, and when the stream is longer than it says", async () => {
    expect(await readBodyText(post("x", { "content-length": "999999" }), 100)).toBeNull();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(60));
        controller.enqueue(new Uint8Array(60));
        controller.close();
      },
    });
    const request = new Request("http://localhost/x", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    expect(await readBodyText(request, 100)).toBeNull();
  });
});
