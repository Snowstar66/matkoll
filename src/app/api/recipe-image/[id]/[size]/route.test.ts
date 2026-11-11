import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail } from "@/lib/errors";

// The Route Handler that sends a stored recipe picture, with the user check and the
// read stubbed: the user is checked before anything is read, every picture that is
// not there gets the same 404 without a body, and a picture is cached privately.

const requireUserForRoute = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUserForRoute: () => requireUserForRoute() }));
const readRecipeImage = vi.fn();
vi.mock("@/features/recipes/server", () => ({ readRecipeImage: (...args: unknown[]) => readRecipeImage(...args) }));

const { GET } = await import("./route");

const id = "66666666-6666-4666-8666-666666666666";
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x10]);

function get(recipeId = id, size = "thumb") {
  return GET(new Request(`http://localhost:3100/api/recipe-image/${recipeId}/${size}`), {
    params: Promise.resolve({ id: recipeId, size }),
  } as never);
}

beforeEach(() => {
  requireUserForRoute.mockReset().mockResolvedValue({ user: { id: "user", email: "pontus@example.com" } });
  readRecipeImage.mockReset().mockResolvedValue({ data: new Blob([webp], { type: "image/webp" }), mediaType: "image/webp" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/recipe-image/[id]/[size]", () => {
  it.each(["thumb", "full"])("sends the %s picture with its own type, cached privately for a day, nosniff", async (size) => {
    const response = await get(id, size);
    expect(response.status).toBe(200);
    expect(readRecipeImage).toHaveBeenCalledWith(id, size);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("content-length")).toBe(String(webp.byteLength));
    expect(response.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(webp);
  });

  it("checks the user first and reads nothing without one", async () => {
    requireUserForRoute.mockResolvedValue({ response: new Response(JSON.stringify(fail("unauthorized")), { status: 401 }) });
    const response = await get();
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(readRecipeImage).not.toHaveBeenCalled();
  });

  it.each([
    ["an id that is not a uuid", "nope", "thumb"],
    ["a size that is not offered", id, "original"],
    ["a size that tries a path", id, "../full"],
  ])("gives the same empty 404 for %s, and reads nothing", async (_name, recipeId, size) => {
    const response = await get(recipeId, size);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(readRecipeImage).not.toHaveBeenCalled();
  });

  it("gives that 404 for a recipe that is gone, another household's or without a copy, never cached", async () => {
    readRecipeImage.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("gives a 500 without a body, and logs only the kind of failure, when the read fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    readRecipeImage.mockRejectedValue(new Error(`boom ${id}`));
    const response = await get();
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("");
    expect(JSON.stringify(log.mock.calls)).not.toContain(id);
  });
});
