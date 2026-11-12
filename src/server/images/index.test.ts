import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { makeRecipePictures, recipeImageLimits } from "./index";

// makeRecipePictures with real pictures made by sharp itself: what is kept is
// WebP, small, upright and free of metadata; what is not a picture is refused.

type Exif = NonNullable<Parameters<ReturnType<typeof sharp>["withExif"]>[0]>;

async function make(width: number, height: number, format: "jpeg" | "png" | "webp" | "gif" = "jpeg", exif?: Exif) {
  let pipeline = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } });
  if (exif) pipeline = pipeline.withExif(exif);
  return new Uint8Array(await pipeline[format]().toBuffer());
}

async function describePicture(bytes: Uint8Array) {
  const metadata = await sharp(bytes).metadata();
  return { format: metadata.format, width: metadata.width, height: metadata.height, exif: metadata.exif, icc: metadata.icc };
}

describe("makeRecipePictures", () => {
  it("makes a full size of at most 1 200 px and a thumbnail of at most 640 px, both WebP", async () => {
    const result = await makeRecipePictures(await make(3000, 2000));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await describePicture(result.full.bytes)).toMatchObject({ format: "webp", width: 1200, height: 800 });
    expect(await describePicture(result.thumb.bytes)).toMatchObject({ format: "webp", width: recipeImageLimits.thumbSide, height: 427 });
    expect(result.full.width).toBe(1200);
    expect(result.thumb.bytes.byteLength).toBeLessThan(result.full.bytes.byteLength);
  });

  it("never scales a small picture up", async () => {
    const result = await makeRecipePictures(await make(300, 200, "png"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await describePicture(result.full.bytes)).toMatchObject({ width: 300, height: 200 });
    expect(await describePicture(result.thumb.bytes)).toMatchObject({ width: 300, height: 200 });
  });

  it.each(["jpeg", "png", "webp", "gif"] as const)("takes a %s", async (format) => {
    const result = await makeRecipePictures(await make(500, 400, format));
    expect(result.ok).toBe(true);
  });

  it("removes the metadata (EXIF with GPS and a camera, the profile) from what it keeps", async () => {
    const input = await make(800, 600, "jpeg", { IFD0: { Make: "Secret camera", Copyright: "Someone" }, IFD3: { GPSLatitudeRef: "N" } });
    expect((await describePicture(input)).exif).toBeDefined();
    const result = await makeRecipePictures(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const picture of [result.full, result.thumb]) {
      const kept = await describePicture(picture.bytes);
      expect(kept.exif).toBeUndefined();
      expect(kept.icc).toBeUndefined();
      expect(Buffer.from(picture.bytes).toString("latin1")).not.toMatch(/Secret camera|Someone|GPS/);
    }
  });

  it("turns a picture upright by its EXIF orientation before the metadata goes", async () => {
    // Stored 800 wide x 400 high with orientation 6 (rotate 90 degrees): shown 400 wide x 800 high.
    const input = new Uint8Array(
      await sharp({ create: { width: 800, height: 400, channels: 3, background: { r: 10, g: 20, b: 30 } } })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .toBuffer(),
    );
    expect((await sharp(input).metadata()).orientation).toBe(6);
    const result = await makeRecipePictures(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await describePicture(result.full.bytes)).toMatchObject({ width: 400, height: 800 });
  });

  it.each([
    ["text", new TextEncoder().encode("hello, this is not a picture")],
    ["an HTML page", new TextEncoder().encode("<html><body><img src=x></body></html>")],
    ["an SVG", new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100"/></svg>')],
    ["nothing", new Uint8Array()],
    ["random bytes", new Uint8Array(5000).map((_, index) => (index * 31) % 251)],
  ])("refuses %s", async (_name, bytes) => {
    expect(await makeRecipePictures(bytes)).toEqual({ ok: false, reason: "not_image" });
  });

  it("refuses a picture that is cut off in the middle of its data", async () => {
    const whole = await make(2000, 1500, "png");
    const result = await makeRecipePictures(whole.subarray(0, Math.floor(whole.byteLength / 2)));
    expect(result.ok).toBe(false);
  });

  it("refuses a picture whose longest side is under 64 px (an icon or a tracking pixel)", async () => {
    expect(await makeRecipePictures(await make(1, 1, "png"))).toEqual({ ok: false, reason: "too_small" });
    expect(await makeRecipePictures(await make(63, 40))).toEqual({ ok: false, reason: "too_small" });
  });

  it("refuses a picture of more pixels than it will decode (a decompression bomb)", async () => {
    const bomb = await make(6500, 6500, "png");
    expect(bomb.byteLength).toBeLessThan(5 * 1024 * 1024);
    expect(await makeRecipePictures(bomb)).toEqual({ ok: false, reason: "too_large" });
  }, 60_000);

  it("keeps each stored file under the bucket's 1.5 MB, also for a noisy picture", async () => {
    const noise = new Uint8Array(2400 * 1800 * 3).map(() => Math.floor(Math.random() * 256));
    const input = new Uint8Array(await sharp(noise, { raw: { width: 2400, height: 1800, channels: 3 } }).png().toBuffer());
    const result = await makeRecipePictures(input);
    if (result.ok) {
      expect(result.full.bytes.byteLength).toBeLessThanOrEqual(recipeImageLimits.maxOutputBytes);
      expect(result.thumb.bytes.byteLength).toBeLessThanOrEqual(recipeImageLimits.maxOutputBytes);
    } else {
      expect(result).toEqual({ ok: false, reason: "too_large" });
    }
  }, 60_000);
});
