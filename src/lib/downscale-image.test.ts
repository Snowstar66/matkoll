// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fail } from "@/lib/errors";
import { maxImageBytes, maxPlacePhotoSide, placePhotoForClaude } from "@/lib/images";
import { jpegHeader, pngChunk, pngFile, pngHeader } from "../../tests/support/image-headers";
import { downscaleImage, fitWithin, halvingSteps, jpegQualities, orientationMatrix, qualitiesFrom, resetBitmapTurnsProbe } from "./downscale-image";

// jsdom decodes no images and draws nothing, so createImageBitmap and the
// canvas are fakes: the bitmap has the size the test gives it (or the size
// asked for, when the browser "supports" resizing), the canvas records what
// was drawn, and toBlob gives JPEGs of a chosen size per quality. The files
// are real headers padded with zeros, so their type, size and EXIF
// orientation can be read.

describe("fitWithin", () => {
  it.each([
    ["landscape", 4000, 3000, { width: 1600, height: 1200 }],
    ["portrait", 3000, 4000, { width: 1200, height: 1600 }],
    ["square", 2000, 2000, { width: 1600, height: 1600 }],
    ["long and thin", 10_000, 3, { width: 1600, height: 1 }],
    ["exactly 1600", 1600, 900, { width: 1600, height: 900 }],
    ["smaller", 768, 942, { width: 768, height: 942 }],
  ])("%s: %i × %i", (_name, width, height, expected) => {
    expect(fitWithin(width, height)).toEqual(expected);
  });

  it("never gives a longest side over the limit, however it rounds", () => {
    for (let width = 1601; width < 1700; width++) {
      const size = fitWithin(width, 1599);
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(1600);
    }
  });
});

describe("halvingSteps", () => {
  it("halves until the next step is at most twice the target", () => {
    expect(halvingSteps({ width: 8000, height: 6000 }, { width: 1600, height: 1200 })).toEqual([
      { width: 4000, height: 3000 },
      { width: 2000, height: 1500 },
      { width: 1600, height: 1200 },
    ]);
  });

  it("draws in one step when the factor is at most two", () => {
    expect(halvingSteps({ width: 3000, height: 2000 }, { width: 1600, height: 1067 })).toEqual([{ width: 1600, height: 1067 }]);
    expect(halvingSteps({ width: 768, height: 942 }, { width: 768, height: 942 })).toEqual([{ width: 768, height: 942 }]);
  });
});

const blob = (bytes: Uint8Array, type: string) => new Blob([bytes as BlobPart], { type });
/** A camera JPEG of 4000 × 3000, `orientation` as EXIF. */
const cameraJpeg = (orientation?: number, size = 6 * 1024 * 1024) =>
  blob(jpegHeader(4000, 3000, { size, orientation }), "image/jpeg");

type Draw = { canvas: { width: number; height: number }; from: { width: number; height: number }; fill?: string; quality?: string };
let drawn: Draw[];
let qualities: number[];
let jpegSizeFor: (quality: number) => number;
/** Whether the fake browser honours resizeWidth/resizeHeight. */
let resizes: boolean;
/** The size of a full decode. */
let fullSize: { width: number; height: number };
let closed: number;
/** The byte length of the probe JPEG inside downscale-image.ts. */
const probeSize = 811;
/** Whether the fake browser turns photos by EXIF in createImageBitmap (Safari has been seen not to). */
let bitmapTurns: boolean;
/** The matrix [a, b, c, d, e, f] set on the canvas, per draw (null when drawn straight). */
let transforms: (number[] | null)[];
const createImageBitmap = vi.fn();

beforeEach(() => {
  drawn = [];
  qualities = [];
  jpegSizeFor = () => 200_000;
  resizes = true;
  fullSize = { width: 4000, height: 3000 };
  closed = 0;
  bitmapTurns = true;
  transforms = [];
  resetBitmapTurnsProbe();
  createImageBitmap.mockReset().mockImplementation(async (file: Blob, options?: ImageBitmapOptions) => {
    // The probe: a tiny JPEG with orientation 6 is 1 × 2 where the browser turns, 2 × 1 where it does not.
    if (file.size === probeSize) return { width: bitmapTurns ? 1 : 2, height: bitmapTurns ? 2 : 1, close: () => closed++ };
    const size =
      resizes && options?.resizeWidth && options.resizeHeight
        ? { width: options.resizeWidth, height: options.resizeHeight }
        : fullSize;
    return { ...size, close: () => closed++ };
  });
  vi.stubGlobal("createImageBitmap", createImageBitmap);

  function fakeContext(canvas: HTMLCanvasElement) {
    let fill: string | undefined;
    let matrix: number[] | null = null;
    const context = {
      setTransform: (...values: number[]) => {
        matrix = values.length && values.join() !== "1,0,0,1,0,0" ? values : null;
      },
      transform: (...values: number[]) => {
        // Only a scale before it, so the product is read as scale then the orientation matrix.
        matrix = [...(matrix ?? []), ...values];
      },
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      set fillStyle(value: string) {
        fill = value;
      },
      fillRect: () => {},
      drawImage: (_source: unknown, _sx: number, _sy: number, sw: number, sh: number, _dx: number, _dy: number, dw: number, dh: number) => {
        if (matrix) {
          transforms.push(matrix);
          drawn.push({ canvas: { width: canvas.width, height: canvas.height }, from: { width: sw, height: sh }, fill, quality: context.imageSmoothingQuality });
          return;
        }
        transforms.push(null);
        expect([canvas.width, canvas.height]).toEqual([dw, dh]);
        expect(context.imageSmoothingEnabled).toBe(true);
        drawn.push({ canvas: { width: dw, height: dh }, from: { width: sw, height: sh }, fill, quality: context.imageSmoothingQuality });
      },
    };
    return context as unknown as CanvasRenderingContext2D;
  }
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    return fakeContext(this);
  } as unknown as typeof HTMLCanvasElement.prototype.getContext);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback, type, quality) => {
    expect(type).toBe("image/jpeg");
    qualities.push(quality as number);
    callback(blob(jpegHeader(1600, 1200, { size: jpegSizeFor(quality as number) }), "image/jpeg"));
  });
});

/** jsdom's <img> has no decode(); this one answers as `decode` says. */
function stubImageDecode(decode: () => Promise<void>) {
  Object.defineProperty(HTMLImageElement.prototype, "decode", { value: decode, configurable: true, writable: true });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
});

describe("orientationMatrix", () => {
  // A 4 × 2 image; where do its corners go? (0,0) is the stored top left.
  const at = (orientation: number, x: number, y: number) => {
    const [a, b, c, d, e, f] = orientationMatrix(orientation, 4, 2);
    return [a * x + c * y + e, b * x + d * y + f];
  };

  it.each([
    [2, [4, 0]],
    [3, [4, 2]],
    [4, [0, 2]],
    [5, [0, 0]],
    [6, [2, 0]],
    [7, [2, 4]],
    [8, [0, 4]],
  ])("orientation %i puts the stored top left at %j", (orientation, expected) => {
    expect(at(orientation, 0, 0)).toEqual(expected);
  });

  it("makes the quarter turns portrait (6 and 8 map the stored width to the height)", () => {
    expect(at(6, 4, 2)).toEqual([0, 4]);
    expect(at(8, 4, 2)).toEqual([2, 0]);
  });
});

describe("downscaleImage", () => {
  it("decodes a large photo straight to 1600 px where the browser can, and makes it a JPEG", async () => {
    const photo = cameraJpeg();
    const result = await downscaleImage(photo);

    expect(createImageBitmap).toHaveBeenCalledTimes(1);
    expect(createImageBitmap).toHaveBeenCalledWith(photo, {
      imageOrientation: "from-image",
      resizeWidth: 1600,
      resizeHeight: 1200,
      resizeQuality: "high",
    });
    expect(drawn).toEqual([{ canvas: { width: 1600, height: 1200 }, from: { width: 1600, height: 1200 }, fill: "white", quality: "high" }]);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.type).toBe("image/jpeg");
    expect(qualities).toEqual([0.85]);
    expect(closed).toBe(1);
  });

  it("decodes a photo of a place to 2048 px when asked (Story 6.5)", async () => {
    const photo = cameraJpeg(6);
    const result = await downscaleImage(photo, { maxSide: maxPlacePhotoSide });
    expect(maxPlacePhotoSide).toBe(2048);
    expect(createImageBitmap.mock.calls.at(-1)?.[1]).toMatchObject({ resizeWidth: 1536, resizeHeight: 2048 });
    expect(drawn.at(-1)?.canvas).toEqual({ width: 1536, height: 2048 });
    expect(result.ok).toBe(true);
  });

  it("makes a fridge photo for Claude 2048 px at quality 0.85 first, then the lower qualities (Kylfoto A)", async () => {
    jpegSizeFor = (quality) => (quality > 0.65 ? maxImageBytes + 1 : maxImageBytes);
    const result = await downscaleImage(cameraJpeg(6), placePhotoForClaude);
    expect(createImageBitmap.mock.calls.at(-1)?.[1]).toMatchObject({ resizeWidth: 1536, resizeHeight: 2048 });
    expect(drawn.at(-1)?.canvas).toEqual({ width: 1536, height: 2048 });
    expect(qualities).toEqual([0.85, 0.75, 0.65]);
    expect(result.ok).toBe(true);
  });

  it("asks for the turned size when EXIF turns the photo a quarter", async () => {
    await downscaleImage(cameraJpeg(6));
    expect(createImageBitmap.mock.calls.at(-1)?.[1]).toMatchObject({ resizeWidth: 1200, resizeHeight: 1600 });
    expect(drawn.at(-1)?.canvas).toEqual({ width: 1200, height: 1600 });
  });

  it("decodes in full and draws down in halving steps when the browser cannot resize", async () => {
    resizes = false;
    fullSize = { width: 8000, height: 6000 };
    const result = await downscaleImage(blob(jpegHeader(8000, 6000, { size: 6 * 1024 * 1024 }), "image/jpeg"));

    expect(createImageBitmap).toHaveBeenCalledTimes(2);
    expect(createImageBitmap.mock.calls[1][1]).toEqual({ imageOrientation: "from-image" });
    expect(drawn.map(({ canvas, from, quality }) => ({ canvas, from, quality }))).toEqual([
      { canvas: { width: 4000, height: 3000 }, from: { width: 8000, height: 6000 }, quality: "high" },
      { canvas: { width: 2000, height: 1500 }, from: { width: 4000, height: 3000 }, quality: "high" },
      { canvas: { width: 1600, height: 1200 }, from: { width: 2000, height: 1500 }, quality: "high" },
    ]);
    // Only the last step gets the white page.
    expect(drawn.map(({ fill }) => fill)).toEqual([undefined, undefined, "white"]);
    expect(result.ok).toBe(true);
    // The ignored resized bitmap and the full one are both closed.
    expect(closed).toBe(2);
  });

  it("decodes in full when the header cannot be read", async () => {
    fullSize = { width: 3000, height: 4000 };
    await downscaleImage(blob(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]), "image/jpeg"));
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
    expect(createImageBitmap.mock.calls[0][1]).toEqual({ imageOrientation: "from-image" });
    expect(drawn.at(-1)?.canvas).toEqual({ width: 1200, height: 1600 });
  });

  it("lowers the quality until the photo fits in 1.5 MB", async () => {
    jpegSizeFor = (quality) => (quality > 0.65 ? maxImageBytes + 1 : maxImageBytes);
    const result = await downscaleImage(cameraJpeg());
    expect(qualities).toEqual([0.85, 0.75, 0.65]);
    expect(result.ok && result.data.size).toBe(maxImageBytes);
  });

  it("gives image_too_large when even the lowest quality is over 1.5 MB", async () => {
    jpegSizeFor = () => maxImageBytes + 1;
    expect(await downscaleImage(cameraJpeg())).toEqual(fail("image_too_large"));
    expect(qualities).toEqual([...jpegQualities]);
    expect(closed).toBe(1);
  });

  it.each([
    ["a RangeError while decoding", () => createImageBitmap.mockRejectedValue(new RangeError("Array buffer allocation failed"))],
    ["an out-of-memory error while decoding", () => createImageBitmap.mockRejectedValue(new DOMException("Out of memory", "UnknownError"))],
    ["no canvas", () => vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)],
    ["no JPEG from the canvas", () => vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(null))],
  ])("gives image_too_large, not unsupported, for %s", async (_name, arrange) => {
    arrange();
    expect(await downscaleImage(cameraJpeg())).toEqual(fail("image_too_large"));
  });

  it("re-encodes a small JPEG too, so its camera rotation is applied", async () => {
    fullSize = { width: 1200, height: 900 };
    const result = await downscaleImage(blob(jpegHeader(1200, 900, { size: 300_000 }), "image/jpeg"));
    expect(drawn.map(({ canvas }) => canvas)).toEqual([{ width: 1200, height: 900 }]);
    expect(result.ok && result.data.type).toBe("image/jpeg");
  });

  it("sends a PNG that fits and is shown at its header's size with the same bytes, when it has no metadata", async () => {
    fullSize = { width: 768, height: 942 };
    const bytes = pngFile(768, 942, { size: 110_000 });
    const result = await downscaleImage(blob(bytes, "image/png"));
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.type).toBe("image/png");
    expect(new Uint8Array(await result.data.arrayBuffer())).toEqual(bytes);
    expect(drawn).toEqual([]);
  });

  it("sends a PNG that fits without its metadata chunks: no text, EXIF or time", async () => {
    fullSize = { width: 768, height: 942 };
    const idat = pngChunk("IDAT", new Uint8Array(1000));
    const withMetadata = pngFile(768, 942, {
      chunks: [pngChunk("tEXt", [..."GPS 59.3"].map((c) => c.charCodeAt(0))), pngChunk("eXIf", [1, 2, 3]), pngChunk("tIME", [7, 234, 10, 26, 9, 0, 0]), idat],
    });
    const result = await downscaleImage(blob(withMetadata, "image/png"));
    if (!result.ok) throw new Error(result.error.code);
    expect(new Uint8Array(await result.data.arrayBuffer())).toEqual(pngFile(768, 942, { chunks: [idat] }));
    expect(drawn).toEqual([]);
  });

  it("re-encodes a PNG that fits but whose chunks cannot be read", async () => {
    fullSize = { width: 768, height: 942 };
    const result = await downscaleImage(blob(pngHeader(768, 942, 110_000), "image/png"));
    expect(drawn).toHaveLength(1);
    expect(result.ok && result.data.type).toBe("image/jpeg");
  });

  it("re-encodes a PNG that the browser turns (eXIf), even when it fits", async () => {
    fullSize = { width: 942, height: 768 };
    const result = await downscaleImage(blob(pngHeader(768, 942, 110_000), "image/png"));
    expect(drawn.map(({ canvas }) => canvas)).toEqual([{ width: 942, height: 768 }]);
    expect(result.ok && result.data.type).toBe("image/jpeg");
  });

  it("re-encodes a PNG that is too large, by size or by side", async () => {
    fullSize = { width: 768, height: 942 };
    await downscaleImage(blob(pngHeader(768, 942, maxImageBytes + 1), "image/png"));
    await downscaleImage(blob(pngHeader(2400, 1200, 110_000), "image/png"));
    expect(drawn.map(({ canvas }) => [canvas.width, canvas.height])).toEqual([
      [768, 942],
      [1600, 800],
    ]);
  });

  it("does not trust the file's stated type: a JPEG called PNG is re-encoded", async () => {
    fullSize = { width: 768, height: 942 };
    const result = await downscaleImage(blob(jpegHeader(768, 942, { size: 110_000 }), "image/png"));
    expect(drawn).toHaveLength(1);
    expect(result.ok && result.data.type).toBe("image/jpeg");
  });

  it("gives image_unsupported when the file cannot be decoded, and sends nothing", async () => {
    createImageBitmap.mockRejectedValue(new DOMException("The source image could not be decoded.", "InvalidStateError"));
    // jsdom's <img> cannot decode anything either, like Chrome with HEIC.
    stubImageDecode(() => Promise.reject(new DOMException("decode", "EncodingError")));
    const heic = blob(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]), "image/heic");
    expect(await downscaleImage(heic)).toEqual(fail("image_unsupported"));
    expect(qualities).toEqual([]);
  });

  it("falls back to <img> when createImageBitmap does not take the options", async () => {
    createImageBitmap.mockRejectedValue(new TypeError("imageOrientation"));
    stubImageDecode(() => Promise.resolve());
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(3000);
    vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(4000);
    const revokeObjectURL = vi.fn();
    // jsdom's URL has no object URLs; a URL class with them, for this test only.
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = () => "blob:photo";
        static revokeObjectURL = revokeObjectURL;
      },
    );

    const result = await downscaleImage(cameraJpeg(6));
    expect(drawn.at(-1)?.canvas).toEqual({ width: 1200, height: 1600 });
    expect(result.ok).toBe(true);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:photo");
  });
});

describe("qualitiesFrom (Kylfoto A)", () => {
  it("is jpegQualities without a first quality", () => {
    expect(qualitiesFrom(undefined)).toEqual([...jpegQualities]);
  });

  it("starts at the given quality and goes on with the lower ones", () => {
    expect(qualitiesFrom(0.8)).toEqual([0.8, 0.75, 0.65, 0.5]);
    expect(qualitiesFrom(0.85)).toEqual([0.85, 0.75, 0.65, 0.5]);
  });
});

describe("downscaleImage when the browser leaves the pixels as stored (Safari)", () => {
  beforeEach(() => {
    bitmapTurns = false;
  });

  it("does not ask to resize, decodes in full and turns a portrait photo (orientation 6) by hand", async () => {
    fullSize = { width: 4000, height: 3000 };
    const result = await downscaleImage(cameraJpeg(6));

    // The probe, then the full decode: no resizing bitmap.
    expect(createImageBitmap.mock.calls.some(([, options]) => options?.resizeWidth)).toBe(false);
    expect(drawn.at(-1)?.canvas).toEqual({ width: 1200, height: 1600 });
    expect(drawn[0].from).toEqual({ width: 4000, height: 3000 });
    // The first halving step is 1500 × 2000: scaled by half and turned a quarter clockwise.
    expect(transforms[0]).toEqual([0.5, 0, 0, 0.5, 0, 0, ...orientationMatrix(6, 4000, 3000)]);
    expect(result.ok).toBe(true);
  });

  it.each([3, 8])("turns orientation %i by hand too", async (orientation) => {
    await downscaleImage(cameraJpeg(orientation));
    expect(transforms.find(Boolean)?.slice(6)).toEqual(orientationMatrix(orientation, 4000, 3000));
  });

  it("leaves an upright photo (orientation 1) alone: no probe, no transform", async () => {
    await downscaleImage(cameraJpeg());
    expect(transforms.at(-1)).toBeNull();
    expect(createImageBitmap.mock.calls.every(([file]) => (file as Blob).size !== probeSize)).toBe(true);
  });

  it("turns by hand a photo that <img> shows as stored (sides not swapped)", async () => {
    createImageBitmap.mockRejectedValue(new TypeError("imageOrientation"));
    stubImageDecode(() => Promise.resolve());
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(4000);
    vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(3000);
    vi.stubGlobal("URL", class extends URL { static createObjectURL = () => "blob:photo"; static revokeObjectURL = () => {}; });

    await downscaleImage(cameraJpeg(6));
    expect(drawn.at(-1)?.canvas).toEqual({ width: 1200, height: 1600 });
    expect(transforms.find(Boolean)?.slice(6)).toEqual(orientationMatrix(6, 4000, 3000));
  });

  it("does not turn twice: a browser that turns gets no transform", async () => {
    bitmapTurns = true;
    fullSize = { width: 3000, height: 4000 };
    resizes = false;
    await downscaleImage(cameraJpeg(6));
    expect(transforms.every((matrix) => matrix === null)).toBe(true);
    expect(drawn.at(-1)?.canvas).toEqual({ width: 1200, height: 1600 });
  });
});
