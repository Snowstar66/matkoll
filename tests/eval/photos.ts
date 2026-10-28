import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { imageSizeOf, imageTypeOf, maxImageBytes, maxPlacePhotoSide, stripJpegMetadata, stripPngMetadata } from "@/lib/images";

// Pontus's photos for `pnpm eval:ai` (analyze-image.eval.ts, and from Story
// 12.2 warm-up.eval.ts), as the client would send them. Git ignores the
// folder; nothing of a photo is ever printed or written.

export const photoTypes = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic"]);

/**
 * The photo at `path` as the client would send it, without metadata: a JPEG
 * or PNG that fits is stripped (stripJpegMetadata, stripPngMetadata), and
 * any other photo (too large, WebP, HEIC) is made small with macOS's sips to
 * at most 2048 px at quality 85, as the client makes a photo of a place
 * (Story 6.5), into a temporary folder that is removed afterwards, and then
 * stripped.
 */
export function preparePhoto(path: string): { data: Uint8Array; mediaType: string } | { error: string } {
  const bytes = new Uint8Array(readFileSync(path));
  const type = imageTypeOf(bytes);
  const size = imageSizeOf(bytes);
  const fits = size !== null && bytes.byteLength <= maxImageBytes && Math.max(size.width, size.height) <= maxPlacePhotoSide;
  if (fits && type === "image/jpeg") {
    const stripped = stripJpegMetadata(bytes);
    if (stripped) return { data: stripped, mediaType: type };
  }
  if (fits && type === "image/png") {
    const stripped = stripPngMetadata(bytes);
    if (stripped) return { data: stripped, mediaType: type };
  }
  if (process.platform !== "darwin") return { error: "convert it to a JPEG or PNG of at most 2048 px and 1.5 MB" };
  const temporary = mkdtempSync(join(tmpdir(), "matkoll-eval-"));
  try {
    const out = join(temporary, "photo.jpg");
    // Made smaller only when its longest side is over 2048 px (sips -Z would also make a small photo larger).
    const longest = size ? Math.max(size.width, size.height) : sipsLongestSide(path);
    const resize = longest === null || longest > maxPlacePhotoSide ? ["-Z", String(maxPlacePhotoSide)] : [];
    execFileSync("sips", [...resize, "-s", "format", "jpeg", "-s", "formatOptions", "85", path, "--out", out], {
      stdio: "ignore",
    });
    const resized = stripJpegMetadata(new Uint8Array(readFileSync(out)));
    if (!resized || resized.byteLength > maxImageBytes) return { error: "too_large after sips" };
    return { data: resized, mediaType: "image/jpeg" };
  } catch {
    return { error: "unreadable (sips could not convert it)" };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

/** The longest side of a photo imageSizeOf cannot read (HEIC), from sips; `null` when sips cannot tell. */
function sipsLongestSide(path: string): number | null {
  try {
    const output = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", path], { encoding: "utf8" });
    const sides = [...output.matchAll(/pixel(?:Width|Height):\s*(\d+)/g)].map((match) => Number(match[1]));
    return sides.length === 2 ? Math.max(...sides) : null;
  } catch {
    return null;
  }
}
