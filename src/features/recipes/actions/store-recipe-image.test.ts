import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecipeDataError } from "../data/client";

// storeRecipeImage and its helpers with the data functions, the fetch port and
// the image maker stubbed: what is fetched, what is kept, and that a failure
// never throws and never leaves a file without a row behind it.

const db = { session: true };
const getImageStateIn = vi.fn();
const imageRoomIn = vi.fn();
const uploadImageIn = vi.fn();
const removeImagesIn = vi.fn();
const setImagePathIn = vi.fn();
const orphanImagesIn = vi.fn();
vi.mock("../data/image", () => ({
  imageUploadRefusedDetail: "image_upload_refused",
  getImageStateIn: (...args: unknown[]) => getImageStateIn(...args),
  imageRoomIn: (...args: unknown[]) => imageRoomIn(...args),
  uploadImageIn: (...args: unknown[]) => uploadImageIn(...args),
  removeImagesIn: (...args: unknown[]) => removeImagesIn(...args),
  setImagePathIn: (...args: unknown[]) => setImagePathIn(...args),
  orphanImagesIn: (...args: unknown[]) => orphanImagesIn(...args),
}));
const fetchRecipeImage = vi.fn();
vi.mock("@/server/fetch", () => ({ fetchRecipeImage: (...args: unknown[]) => fetchRecipeImage(...args) }));
const makeRecipePictures = vi.fn();
vi.mock("@/server/images", () => ({ makeRecipePictures: (...args: unknown[]) => makeRecipePictures(...args) }));

const { storeRecipeImage, recipeImageFolderOf, removeRecipeImages, sweepRecipeImages } = await import("./store-recipe-image");

const household = "1f3a2b0c-aaaa-4bbb-8ccc-0d0e0f101112";
const recipe = "7b7b4c1e-8c0d-4a43-9a43-0a4f0a1f0a11";
const folder = `${household}/${recipe}`;
const address = "https://img.koket.se/secret-dish.jpg";
const full = new Uint8Array([1, 1, 1]);
const thumb = new Uint8Array([2, 2]);

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  getImageStateIn.mockReset().mockResolvedValue({ householdId: household, imageUrl: address, imagePath: null });
  imageRoomIn.mockReset().mockResolvedValue(true);
  uploadImageIn.mockReset().mockResolvedValue(undefined);
  removeImagesIn.mockReset().mockResolvedValue(undefined);
  setImagePathIn.mockReset().mockResolvedValue(true);
  orphanImagesIn.mockReset().mockResolvedValue([]);
  fetchRecipeImage.mockReset().mockResolvedValue({ ok: true, bytes: new Uint8Array([9, 9, 9]) });
  makeRecipePictures.mockReset().mockResolvedValue({ ok: true, full: { bytes: full, width: 1200, height: 800 }, thumb: { bytes: thumb, width: 640, height: 427 } });
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

const logged = () => JSON.stringify(warn.mock.calls);

describe("storeRecipeImage", () => {
  it("fetches the address, keeps a full size and a thumbnail under <household>/<recipe>/ and then points the recipe at them", async () => {
    const calls: string[] = [];
    uploadImageIn.mockImplementation(async (_db: unknown, path: string) => void calls.push(`upload ${path}`));
    setImagePathIn.mockImplementation(async () => void calls.push("path"));
    expect(await storeRecipeImage(db as never, recipe)).toBe("stored");
    expect(fetchRecipeImage).toHaveBeenCalledWith(address, {});
    expect(makeRecipePictures).toHaveBeenCalledWith(new Uint8Array([9, 9, 9]));
    expect(uploadImageIn).toHaveBeenCalledWith(db, `${folder}/full`, full);
    expect(uploadImageIn).toHaveBeenCalledWith(db, `${folder}/thumb`, thumb);
    expect(setImagePathIn).toHaveBeenCalledWith(db, recipe, folder);
    // The row points at the files only after both are there.
    expect(calls).toEqual([`upload ${folder}/full`, `upload ${folder}/thumb`, "path"]);
    expect(removeImagesIn).toHaveBeenCalledTimes(1); // only the clean-up before the upload
  });

  it("passes the caller's signal on to the fetch", async () => {
    const signal = new AbortController().signal;
    await storeRecipeImage(db as never, recipe, { signal });
    expect(fetchRecipeImage).toHaveBeenCalledWith(address, { signal });
  });

  it.each([
    ["a recipe that is not the household's", null],
    ["a recipe without an image address", { householdId: household, imageUrl: null, imagePath: null }],
    ["a recipe that has its own copy already", { householdId: household, imageUrl: address, imagePath: folder }],
  ])("does nothing for %s", async (_name, state) => {
    getImageStateIn.mockResolvedValue(state);
    expect(await storeRecipeImage(db as never, recipe)).toBe("skipped");
    expect(fetchRecipeImage).not.toHaveBeenCalled();
    expect(uploadImageIn).not.toHaveBeenCalled();
  });

  it("does not fetch anything when the household is at its cap", async () => {
    imageRoomIn.mockResolvedValue(false);
    expect(await storeRecipeImage(db as never, recipe)).toBe("cap");
    expect(fetchRecipeImage).not.toHaveBeenCalled();
  });

  it("goes on when the room cannot be read (the bucket's policy decides)", async () => {
    imageRoomIn.mockResolvedValue(null);
    expect(await storeRecipeImage(db as never, recipe)).toBe("stored");
  });

  it("fails quietly, keeping the recipe as it is, when the picture cannot be fetched, with the reason and never the address", async () => {
    fetchRecipeImage.mockResolvedValue({ ok: false, reason: "blocked_address" });
    expect(await storeRecipeImage(db as never, recipe)).toBe("failed");
    expect(uploadImageIn).not.toHaveBeenCalled();
    expect(setImagePathIn).not.toHaveBeenCalled();
    expect(logged()).toContain("fetch_blocked_address");
    expect(logged()).not.toMatch(/secret-dish|koket/);
  });

  it("fails quietly when what came is not a picture", async () => {
    makeRecipePictures.mockResolvedValue({ ok: false, reason: "not_image" });
    expect(await storeRecipeImage(db as never, recipe)).toBe("failed");
    expect(uploadImageIn).not.toHaveBeenCalled();
    expect(logged()).toContain("picture_not_image");
  });

  it("removes what it uploaded when the second upload fails, and points the recipe at nothing", async () => {
    uploadImageIn.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new RecipeDataError("image_upload_failed 500"));
    expect(await storeRecipeImage(db as never, recipe)).toBe("failed");
    expect(setImagePathIn).not.toHaveBeenCalled();
    expect(removeImagesIn).toHaveBeenLastCalledWith(db, [`${folder}/full`]);
  });

  it("removes both files when the row cannot be updated", async () => {
    setImagePathIn.mockRejectedValue(new RecipeDataError("image_path_failed 42501"));
    expect(await storeRecipeImage(db as never, recipe)).toBe("failed");
    expect(removeImagesIn).toHaveBeenLastCalledWith(db, [`${folder}/full`, `${folder}/thumb`]);
  });

  it("answers cap when Storage refuses the upload by its policy (the cap reached by an upload at the same time)", async () => {
    uploadImageIn.mockRejectedValue(new RecipeDataError("image_upload_refused"));
    expect(await storeRecipeImage(db as never, recipe)).toBe("cap");
    expect(setImagePathIn).not.toHaveBeenCalled();
  });

  it("never throws, whatever goes wrong", async () => {
    getImageStateIn.mockRejectedValue(new Error("boom with https://secret.example/x"));
    expect(await storeRecipeImage(db as never, recipe)).toBe("failed");
    expect(logged()).not.toMatch(/secret|boom/);
  });
});

describe("removing a recipe's pictures", () => {
  it("reads the folder before the recipe is deleted, null when there is no copy", async () => {
    getImageStateIn.mockResolvedValue({ householdId: household, imageUrl: address, imagePath: folder });
    expect(await recipeImageFolderOf(db as never, recipe)).toBe(folder);
    getImageStateIn.mockResolvedValue({ householdId: household, imageUrl: address, imagePath: null });
    expect(await recipeImageFolderOf(db as never, recipe)).toBeNull();
    getImageStateIn.mockRejectedValue(new Error("down"));
    expect(await recipeImageFolderOf(db as never, recipe)).toBeNull();
  });

  it("removes the full size and the thumbnail with the Storage API", async () => {
    await removeRecipeImages(db as never, folder);
    expect(removeImagesIn).toHaveBeenCalledWith(db, [`${folder}/full`, `${folder}/thumb`]);
  });

  it("does nothing without a folder, and never throws when the files stay", async () => {
    await removeRecipeImages(db as never, null);
    expect(removeImagesIn).not.toHaveBeenCalled();
    removeImagesIn.mockRejectedValue(new RecipeDataError("image_remove_failed 500"));
    await expect(removeRecipeImages(db as never, folder)).resolves.toBeUndefined();
  });

  it("sweeps the files no recipe points at, and never throws", async () => {
    orphanImagesIn.mockResolvedValue([`${folder}/full`]);
    await sweepRecipeImages(db as never);
    expect(removeImagesIn).toHaveBeenCalledWith(db, [`${folder}/full`]);
    orphanImagesIn.mockRejectedValue(new RecipeDataError("images_orphans_failed 500"));
    await expect(sweepRecipeImages(db as never)).resolves.toBeUndefined();
  });
});
