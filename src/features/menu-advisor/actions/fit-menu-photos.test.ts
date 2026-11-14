import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";
import { maxMenuBodyBytes, maxMenuPages, menuPhotosBudgetBytes } from "@/lib/images";

// Tolka menyn with several pages: the pages together must fit one request under Vercel's 4.5 MB. The photo is not
// decoded here (downscaleImage is mocked: it "makes" a JPEG of the asked size when the limit allows).

type Options = { maxSide?: number; quality?: number; maxBytes?: number };
const downscaleImage = vi.fn<(file: Blob, options?: Options) => Promise<Result<Blob>>>();
vi.mock("@/lib/downscale-image", () => ({ downscaleImage: (file: Blob, options?: Options) => downscaleImage(file, options) }));

const { fitMenuPhotos } = await import("./read-menu");

const jpeg = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
const sum = (blobs: readonly Blob[]) => blobs.reduce((total, blob) => total + blob.size, 0);

beforeEach(() => {
  // A page at 2048 px is 900 KB at quality 0.75, 1792 px is 700 KB, 1600 px is 550 KB: it fits when that is under maxBytes.
  const sizes: Record<number, number> = { 2048: 900_000, 1792: 700_000, 1600: 550_000 };
  downscaleImage.mockReset().mockImplementation(async (_file, options) => {
    const size = sizes[options?.maxSide ?? 2048] ?? 900_000;
    return size <= (options?.maxBytes ?? Infinity) ? ok(jpeg(size)) : fail("image_too_large");
  });
});

describe("fitMenuPhotos", () => {
  it("leaves pages alone when together they fit, and the budget leaves room under the route's 4 MiB, itself under Vercel's 4.5 MB", async () => {
    expect(maxMenuBodyBytes).toBeLessThan(4_500_000);
    expect(menuPhotosBudgetBytes).toBeLessThan(maxMenuBodyBytes);
    const pages = [jpeg(700_000), jpeg(800_000), jpeg(600_000)];
    const fitted = await fitMenuPhotos(pages);
    expect(fitted).toEqual(ok(pages));
    expect(downscaleImage).not.toHaveBeenCalled();
  });

  it("makes the heavy pages of six smaller until each fits its share, and leaves light ones as they are", async () => {
    const pages = [jpeg(1_400_000), jpeg(1_200_000), jpeg(300_000), jpeg(1_000_000), jpeg(900_000), jpeg(800_000)];
    expect(pages).toHaveLength(maxMenuPages);
    const fitted = await fitMenuPhotos(pages);
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    expect(fitted.data).toHaveLength(6);
    expect(sum(fitted.data)).toBeLessThanOrEqual(menuPhotosBudgetBytes);
    // The share is about 688 KB: 2048 px (900 KB) is too heavy, so the pages go to 1600 px (550 KB); 300 KB stays.
    expect(fitted.data[2]).toBe(pages[2]);
    expect(fitted.data.map((blob) => blob.size)).toEqual([550_000, 550_000, 300_000, 550_000, 550_000, 550_000]);
    expect(downscaleImage.mock.calls[0]![1]).toMatchObject({ maxSide: 2048, quality: 0.75 });
  });

  it("fails as image_too_large when a page cannot be made small enough, and passes another failure on", async () => {
    downscaleImage.mockResolvedValue(fail("image_too_large"));
    expect(await fitMenuPhotos([jpeg(1_500_000), jpeg(1_500_000), jpeg(1_500_000)])).toMatchObject({ ok: false, error: { code: "image_too_large" } });
    downscaleImage.mockResolvedValue(fail("image_unsupported"));
    expect(await fitMenuPhotos([jpeg(1_500_000), jpeg(1_500_000), jpeg(1_500_000)])).toMatchObject({ ok: false, error: { code: "image_unsupported" } });
  });
});
