import { describe, expect, it, vi } from "vitest";
import { isHeicBytes, toDecodableImage } from "./heic";

const text = (value: string) => [...value].map((char) => char.charCodeAt(0));

/** An `ftyp` box with the given major and compatible brands. */
function ftyp(major: string, compatible: string[] = []): Uint8Array {
  const size = 16 + compatible.length * 4;
  return new Uint8Array([0, 0, 0, size, ...text("ftyp"), ...text(major), 0, 0, 0, 0, ...compatible.flatMap(text)]);
}

describe("isHeicBytes", () => {
  it("knows HEIC and HEIF by the brands of the ftyp box", () => {
    expect(isHeicBytes(ftyp("heic"))).toBe(true);
    expect(isHeicBytes(ftyp("mif1", ["heic"]))).toBe(true);
    expect(isHeicBytes(ftyp("isom", ["msf1"]))).toBe(true);
  });

  it("leaves AVIF, JPEG, PNG and short files alone", () => {
    expect(isHeicBytes(ftyp("avif", ["mif1", "miaf"]))).toBe(false);
    expect(isHeicBytes(ftyp("mp42", ["isom"]))).toBe(false);
    expect(isHeicBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
    expect(isHeicBytes(new Uint8Array(4))).toBe(false);
  });
});

describe("toDecodableImage", () => {
  const heic = () => new Blob([ftyp("heic", ["mif1"]) as BlobPart], { type: "image/heic" });
  const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" });

  it("passes a JPEG through without converting", async () => {
    const convert = vi.fn();
    const file = jpeg();
    const result = await toDecodableImage(file, { canDecode: async () => false, convert });
    expect(result).toEqual({ ok: true, data: file });
    expect(convert).not.toHaveBeenCalled();
  });

  it("passes a HEIC through when the browser reads it (Safari)", async () => {
    const convert = vi.fn();
    const file = heic();
    const result = await toDecodableImage(file, { canDecode: async () => true, convert });
    expect(result).toEqual({ ok: true, data: file });
    expect(convert).not.toHaveBeenCalled();
  });

  it("converts a HEIC the browser cannot read (Chrome on a Mac), even without a name or type", async () => {
    const converted = jpeg();
    const convert = vi.fn().mockResolvedValue(converted);
    const result = await toDecodableImage(new Blob([ftyp("heix") as BlobPart]), { canDecode: async () => false, convert });
    expect(result).toEqual({ ok: true, data: converted });
    expect(convert).toHaveBeenCalledOnce();
  });

  it("says image_heic_failed when the conversion throws", async () => {
    const result = await toDecodableImage(heic(), { canDecode: async () => false, convert: async () => Promise.reject(new Error("bad")) });
    expect(result).toMatchObject({ ok: false, error: { code: "image_heic_failed" } });
  });
});
