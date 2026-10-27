import { describe, expect, it, vi } from "vitest";
import { ok } from "@/lib/errors";
import type { PhotoPostAnswer } from "./photo-post";
import { photoSave, type PhotoSaveCalls, type PhotoToSave } from "./place-photo-save";

// One photo's save (Story 10.1): sent at the first write that succeeded, and
// once more at a later write only after no answer or a server error, with
// the points when they have come, or the points added once after it was
// saved.

vi.mock("../actions/save-place-photo-points", () => ({ savePlacePhotoPoints: vi.fn() }));

const stugan = "22222222-2222-4222-8222-222222222222";
const photoId = "33333333-3333-4333-8333-333333333333";
const image = new Blob(["kyl"], { type: "image/png" });
const photo: PhotoToSave = {
  image,
  siteId: stugan,
  location: "Kyl",
  takenAt: new Date("2026-10-26T15:42:00.000Z"),
  reading: ["Mellanmjölk 1,5 %", "Smör 500 g"],
};

function fakeCalls() {
  const posts: { form: FormData; answer: (result: PhotoPostAnswer) => void; fail: (error: unknown) => void }[] = [];
  const calls: PhotoSaveCalls = {
    post: vi.fn(
      (form: FormData) => new Promise<PhotoPostAnswer>((resolve, reject) => posts.push({ form, answer: resolve, fail: reject })),
    ),
    savePoints: vi.fn(async () => ok({ saved: true })),
  };
  return { calls, posts };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("photoSave", () => {
  it("sends nothing before a write", () => {
    const { calls } = fakeCalls();
    photoSave(photo, calls);
    expect(calls.post).not.toHaveBeenCalled();
  });

  it("sends the photo as it is, its place, location, time and reading at the first write", async () => {
    const { calls, posts } = fakeCalls();
    photoSave(photo, calls).written();
    expect(posts).toHaveLength(1);
    const { form } = posts[0];
    expect(form.get("image")).toBeInstanceOf(Blob);
    expect(await (form.get("image") as Blob).text()).toBe("kyl");
    expect(form.get("site")).toBe(stugan);
    expect(form.get("location")).toBe("Kyl");
    expect(form.get("takenAt")).toBe("2026-10-26T15:42:00.000Z");
    expect(JSON.parse(form.get("reading") as string)).toEqual(photo.reading);
    expect(form.get("points")).toBeNull();
  });

  it("sends it once, whatever writes follow, after it was saved or refused", async () => {
    for (const answer of [{ kind: "saved", id: photoId }, { kind: "final" }] as const) {
      const { calls, posts } = fakeCalls();
      const save = photoSave(photo, calls);
      save.written();
      save.written();
      posts[0].answer(answer);
      await settle();
      save.written();
      expect(calls.post).toHaveBeenCalledTimes(1);
    }
  });

  it("sends it once more at the next write after no answer or a server error, and no more", async () => {
    const { calls, posts } = fakeCalls();
    const save = photoSave(photo, calls);
    save.written();
    posts[0].answer({ kind: "retry" });
    await settle();
    expect(calls.post).toHaveBeenCalledTimes(1);
    save.written();
    expect(calls.post).toHaveBeenCalledTimes(2);
    posts[1].fail(new Error("offline"));
    await settle();
    save.written();
    expect(calls.post).toHaveBeenCalledTimes(2);
  });

  it("adds the points to the second try's id", async () => {
    const { calls, posts } = fakeCalls();
    const save = photoSave(photo, calls);
    save.written();
    posts[0].answer({ kind: "retry" });
    await settle();
    save.located([{ n: 1, x: 10, y: 20 }]);
    save.written();
    expect(JSON.parse(posts[1].form.get("points") as string)).toEqual({ positions: [{ n: 1, x: 10, y: 20 }] });
    posts[1].answer({ kind: "saved", id: photoId });
    await settle();
    expect(calls.savePoints).not.toHaveBeenCalled();
  });

  it("sends the points with the photo when they came before the write, in item order", () => {
    const { calls, posts } = fakeCalls();
    const save = photoSave(photo, calls);
    save.located([
      { n: 2, x: 30, y: 40 },
      { n: 1, x: 10, y: 20 },
    ]);
    save.written();
    expect(JSON.parse(posts[0].form.get("points") as string)).toEqual({
      positions: [
        { n: 1, x: 10, y: 20 },
        { n: 2, x: 30, y: 40 },
      ],
    });
    expect(calls.savePoints).not.toHaveBeenCalled();
  });

  it("adds points that come after it was saved, once", async () => {
    const { calls, posts } = fakeCalls();
    const save = photoSave(photo, calls);
    save.written();
    posts[0].answer({ kind: "saved", id: photoId });
    await settle();
    save.located([{ n: 1, x: 10, y: 20 }]);
    save.located([{ n: 2, x: 10, y: 20 }]);
    expect(calls.savePoints).toHaveBeenCalledTimes(1);
    expect(calls.savePoints).toHaveBeenCalledWith({ id: photoId, points: { positions: [{ n: 1, x: 10, y: 20 }] } });
  });

  it("adds points that came while it was on its way once it has its id", async () => {
    const { calls, posts } = fakeCalls();
    const save = photoSave(photo, calls);
    save.written();
    save.located([{ n: 1, x: 10, y: 20 }]);
    expect(calls.savePoints).not.toHaveBeenCalled();
    posts[0].answer({ kind: "saved", id: photoId });
    await settle();
    expect(calls.savePoints).toHaveBeenCalledWith({ id: photoId, points: { positions: [{ n: 1, x: 10, y: 20 }] } });
  });

  it.each([
    ["a refusal", { kind: "final" as const }],
    ["no answer", { kind: "retry" as const }],
  ])("sends no points after %s", async (_name, answer: PhotoPostAnswer) => {
    const { calls, posts } = fakeCalls();
    const save = photoSave(photo, calls);
    save.written();
    posts[0].answer(answer);
    await settle();
    save.located([{ n: 1, x: 10, y: 20 }]);
    expect(calls.savePoints).not.toHaveBeenCalled();
  });

  it("sends nothing more for no points, or a call that throws", async () => {
    const { calls, posts } = fakeCalls();
    const save = photoSave(photo, calls);
    save.written();
    posts[0].fail(new Error("offline"));
    await settle();
    save.located([]);
    expect(calls.savePoints).not.toHaveBeenCalled();
  });
});
