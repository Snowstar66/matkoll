import { describe, expect, it } from "vitest";
import { cameraProblem, cameraProblemText, removeShotText, sendQueue, sendShotsLabel, shotCountText, shotsReducer, type Shot } from "./quick-camera";

const shot = (id: string): Shot<string> => ({ id, photo: `photo-${id}`, thumb: `thumb-${id}` });

describe("Snabbkamera's shots", () => {
  it("adds shots in the order they are taken, and counts them", () => {
    let shots = shotsReducer<string>([], { type: "add", shot: shot("a") });
    shots = shotsReducer(shots, { type: "add", shot: shot("b") });
    shots = shotsReducer(shots, { type: "add", shot: shot("c") });
    expect(shots.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(shotCountText(shots.length)).toBe("3 kort");
    // The same shot twice is one shot.
    expect(shotsReducer(shots, { type: "add", shot: shot("b") })).toHaveLength(3);
  });

  it("removes one shot and keeps the order of the others", () => {
    const shots = shotsReducer([shot("a"), shot("b"), shot("c")], { type: "remove", id: "b" });
    expect(shots.map((s) => s.id)).toEqual(["a", "c"]);
    expect(shotCountText(shots.length)).toBe("2 kort");
    expect(shotsReducer(shots, { type: "clear" })).toEqual([]);
  });

  it("sends the photos in the order they were taken", () => {
    const shots = shotsReducer([shot("a"), shot("b"), shot("c")], { type: "remove", id: "a" });
    expect(sendQueue(shots)).toEqual(["photo-b", "photo-c"]);
    expect(sendQueue([])).toEqual([]);
  });

  it("names the buttons", () => {
    expect(shotCountText(0)).toBe("0 kort");
    expect(removeShotText(0)).toBe("Ta bort kort 1");
    expect(sendShotsLabel(1)).toBe("Klar, skicka 1 kort");
    expect(sendShotsLabel(4)).toBe("Klar, skicka 4 kort");
  });

  it("tells a refusal from a missing camera", () => {
    expect(cameraProblem({ name: "NotAllowedError" })).toBe("denied");
    expect(cameraProblem({ name: "SecurityError" })).toBe("denied");
    expect(cameraProblem({ name: "NotFoundError" })).toBe("missing");
    expect(cameraProblem(new TypeError("no mediaDevices"))).toBe("missing");
    expect(cameraProblem(undefined)).toBe("missing");
    expect(cameraProblemText("denied")).toContain("Ta foto");
    expect(cameraProblemText("missing")).toContain("Ta foto");
  });
});
