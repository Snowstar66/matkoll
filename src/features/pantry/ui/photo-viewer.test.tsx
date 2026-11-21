import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PhotoViewMarker } from "../domain/photo-view";
import { PhotoViewer } from "./photo-viewer";

// The one photo view (Enhetlig fotovisning): overview, zooming into a number
// with its name in a fixed line, back to exactly where the view was, switching
// number while zoomed in, statuses in words, and the photo that cannot be shown.

const markers: PhotoViewMarker[] = [
  { n: 1, left: 20, top: 20, name: "Mjölk", status: "present", location: "Kyl" },
  { n: 3, left: 60, top: 30, name: "Vispgrädde 3 dl", status: "gone", location: null },
  { n: 6, left: 15, top: 80, name: "Ketchup", status: "skipped", location: null },
];

function Viewer({
  list = markers,
  initialNumber = null,
  onClose = () => {},
  onPhotoError,
  quietMarkers = false,
}: {
  list?: readonly PhotoViewMarker[];
  initialNumber?: number | null;
  onClose?: () => void;
  onPhotoError?: () => void;
  quietMarkers?: boolean;
}) {
  return (
    <PhotoViewer
      open
      onClose={onClose}
      photo={{ url: "/api/pantry/photo/p1", size: { width: 720, height: 900 } }}
      location="Kyl"
      markers={list}
      initialNumber={initialNumber}
      quietMarkers={quietMarkers}
      alt="Senaste fotot av kylen"
      onPhotoError={onPhotoError}
    >
      <button type="button">Ta bort fotot</button>
    </PhotoViewer>
  );
}

const dialog = () => screen.getByRole("dialog", { name: "Fotot av kylen" });
const marker = (name: RegExp | string) => within(dialog()).getByRole("button", { name });
const root = () => within(dialog()).getByTestId("photo-viewer");
const nameRow = () => within(dialog()).getByTestId("photo-viewer-name");
const decode = () => {
  const image = within(dialog()).getByRole("img");
  Object.defineProperty(image, "naturalWidth", { configurable: true, value: 720 });
  Object.defineProperty(image, "naturalHeight", { configurable: true, value: 900 });
  fireEvent.load(image);
};
/** The sheet's body, which scrolls: jsdom has no stylesheet, so it is given the overflow its classes would give. */
const sheetBody = () => dialog().querySelector<HTMLElement>(".overflow-y-auto")!;

let style: HTMLStyleElement;
beforeEach(() => {
  style = document.createElement("style");
  style.textContent = ".overflow-y-auto { overflow-y: auto; }";
  document.head.append(style);
});
afterEach(() => {
  style.remove();
  window.localStorage.removeItem("livskoll:photo-numbers-hidden");
});

describe("PhotoViewer", () => {
  it("shows the whole photo with every number as a button, a legend, and what is passed under it", () => {
    render(<Viewer />);
    expect(root()).not.toHaveAttribute("data-zoomed");
    expect(dialog()).toHaveAccessibleDescription("Tryck på en siffra för att se vad det är.");
    // No markers before the photo is decoded: they sit on the pixels the model saw.
    expect(within(dialog()).queryAllByTestId("photo-viewer-marker")).toEqual([]);
    decode();
    expect(within(dialog()).getAllByTestId("photo-viewer-marker").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Vara 1: Mjölk, finns i kylen",
      "Vara 3: Vispgrädde 3 dl, finns inte längre",
      "Vara 6: Ketchup, lades inte till",
    ]);
    // A red cross says "gone" and a dashed ring "not added", besides the words in the legend.
    expect(marker(/^Vara 3/).querySelector("svg")).not.toBeNull();
    expect(marker(/^Vara 3/)).not.toHaveTextContent("3");
    expect(marker(/^Vara 6/).className).toContain("border-dashed");
    expect(within(within(dialog()).getByTestId("photo-viewer-legend")).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Finns i listan",
      "Finns inte längre",
      "Lades inte till",
    ]);
    expect(within(dialog()).getByRole("button", { name: "Ta bort fotot" })).toBeInTheDocument();
  });

  it("keeps Matvaror's numbers green, and with quietMarkers (Förråd) dark grey until one is lit", () => {
    const plain: PhotoViewMarker[] = [
      { n: 1, left: 20, top: 20, name: "Hammare", status: null, location: null },
      { n: 2, left: 60, top: 30, name: "Såg", status: null, location: null },
    ];
    const view = render(<Viewer list={plain} />);
    decode();
    for (const button of within(dialog()).getAllByTestId("photo-viewer-marker")) expect(button).toHaveClass("bg-accent");
    view.unmount();
    render(<Viewer list={plain} quietMarkers initialNumber={2} />);
    decode();
    const [first, second] = within(dialog()).getAllByTestId("photo-viewer-marker");
    expect(first).toHaveClass("bg-marker-off");
    expect(first).not.toHaveClass("bg-accent");
    expect(second).toHaveClass("bg-accent");
  });

  it("gives every marker a 44 px tap area and works from the keyboard (they are buttons)", () => {
    render(<Viewer />);
    decode();
    for (const button of within(dialog()).getAllByTestId("photo-viewer-marker")) {
      expect(button.tagName).toBe("BUTTON");
      expect(button.className).toContain("before:-inset-[13px]");
    }
  });

  it("zooms into a number: a fixed line with number, name and status, the others faded, no legend", () => {
    render(<Viewer />);
    decode();
    fireEvent.click(marker(/^Vara 3/));
    expect(root()).toHaveAttribute("data-zoomed", "true");
    expect(dialog()).toHaveAccessibleDescription("Tryck på bilden för att backa.");
    expect(nameRow()).toHaveTextContent("Vispgrädde 3 dl");
    expect(within(nameRow()).getByTestId("photo-viewer-status")).toHaveTextContent("Finns inte längre");
    expect(marker(/^Vara 3/)).toHaveAttribute("aria-pressed", "true");
    expect(marker(/^Vara 1/)).toHaveAttribute("aria-pressed", "false");
    expect(marker(/^Vara 1/).className).toContain("opacity-40");
    expect(within(dialog()).queryByTestId("photo-viewer-legend")).toBeNull();
    // Said by a screen reader when the number changes.
    expect(nameRow()).toHaveAttribute("role", "status");
  });

  it("says Lades inte till in italics words for a number that was never added, and Finns i kylen for a present one", () => {
    render(<Viewer />);
    decode();
    fireEvent.click(marker(/^Vara 6/));
    expect(within(nameRow()).getByTestId("photo-viewer-status")).toHaveTextContent("Lades inte till");
    fireEvent.click(marker(/^Vara 1/));
    expect(within(nameRow()).getByTestId("photo-viewer-status")).toHaveTextContent("Finns i kylen");
    expect(nameRow()).toHaveTextContent("Mjölk");
  });

  it("goes back to the overview with the sheet scrolled exactly where it was, and keeps the first position while switching numbers", () => {
    render(<Viewer />);
    decode();
    const body = sheetBody();
    body.scrollTop = 240;
    body.scrollLeft = 12;
    fireEvent.click(marker(/^Vara 1/));
    // Zooming and switching change what scrolls.
    body.scrollTop = 0;
    body.scrollLeft = 0;
    fireEvent.click(marker(/^Vara 3/));
    body.scrollTop = 7;
    fireEvent.click(within(dialog()).getByRole("button", { name: "Fotot av kylen, tryck för att backa" }));
    expect(root()).not.toHaveAttribute("data-zoomed");
    expect(body.scrollTop).toBe(240);
    expect(body.scrollLeft).toBe(12);
    expect(dialog()).toHaveAccessibleDescription("Tryck på en siffra för att se vad det är.");
    expect(nameRow().textContent).toBe("");
    // The same again from the overview: the new position is the one stored.
    body.scrollTop = 90;
    fireEvent.click(marker(/^Vara 6/));
    body.scrollTop = 0;
    fireEvent.click(within(dialog()).getByRole("button", { name: "Fotot av kylen, tryck för att backa" }));
    expect(body.scrollTop).toBe(90);
  });

  it("opens zoomed in on the given number (a row's camera) and goes back to the overview from there", () => {
    render(<Viewer initialNumber={3} />);
    expect(root()).toHaveAttribute("data-zoomed", "true");
    decode();
    expect(nameRow()).toHaveTextContent("Vispgrädde 3 dl");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Fotot av kylen, tryck för att backa" }));
    expect(root()).not.toHaveAttribute("data-zoomed");
  });

  it("opens at the overview for a number that is not on the photo", () => {
    render(<Viewer initialNumber={9} />);
    expect(root()).not.toHaveAttribute("data-zoomed");
  });

  it("shows plain numbers, no statuses and no legend, for a photo without them", () => {
    render(<Viewer list={markers.map((m) => ({ ...m, status: null, location: null }))} />);
    decode();
    expect(within(dialog()).getAllByTestId("photo-viewer-marker").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Vara 1: Mjölk",
      "Vara 3: Vispgrädde 3 dl",
      "Vara 6: Ketchup",
    ]);
    expect(within(dialog()).queryByTestId("photo-viewer-legend")).toBeNull();
    fireEvent.click(marker(/^Vara 3/));
    expect(nameRow()).toHaveTextContent("Vispgrädde 3 dl");
    expect(within(nameRow()).queryByTestId("photo-viewer-status")).toBeNull();
  });

  it("hides the numbers, the legend and the hint with Dölj siffror, shows them again with Visa siffror, and remembers the choice", () => {
    window.localStorage.removeItem("livskoll:photo-numbers-hidden");
    const first = render(<Viewer />);
    decode();
    const toggle = () => within(dialog()).getByTestId("photo-numbers-toggle");
    expect(toggle()).toHaveTextContent("Dölj siffror");
    expect(toggle()).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog()).getAllByTestId("photo-viewer-marker")).toHaveLength(3);
    fireEvent.click(toggle());
    expect(toggle()).toHaveTextContent("Visa siffror");
    expect(toggle()).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog()).queryAllByTestId("photo-viewer-marker")).toHaveLength(0);
    expect(within(dialog()).queryByTestId("photo-viewer-legend")).toBeNull();
    expect(dialog()).toHaveTextContent("Siffrorna är dolda");
    // The choice is kept for the next opening.
    first.unmount();
    render(<Viewer />);
    decode();
    expect(within(dialog()).getByTestId("photo-numbers-toggle")).toHaveTextContent("Visa siffror");
    expect(within(dialog()).queryAllByTestId("photo-viewer-marker")).toHaveLength(0);
    fireEvent.click(within(dialog()).getByTestId("photo-numbers-toggle"));
    expect(within(dialog()).getAllByTestId("photo-viewer-marker")).toHaveLength(3);
    expect(within(dialog()).getByTestId("photo-viewer-legend")).toBeInTheDocument();
    expect(window.localStorage.getItem("livskoll:photo-numbers-hidden")).toBeNull();
  });

  it("keeps the number zoomed in on, and no switch, when it opens on a number while the numbers are hidden", () => {
    window.localStorage.setItem("livskoll:photo-numbers-hidden", "1");
    render(<Viewer initialNumber={3} />);
    decode();
    expect(within(dialog()).queryByTestId("photo-numbers-toggle")).toBeNull();
    expect(within(dialog()).getAllByTestId("photo-viewer-marker").length).toBeGreaterThan(0);
    expect(nameRow()).toHaveTextContent("Vispgrädde 3 dl");
    window.localStorage.removeItem("livskoll:photo-numbers-hidden");
  });

  it("works when the browser's storage cannot be used", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<Viewer />);
    decode();
    fireEvent.click(within(dialog()).getByTestId("photo-numbers-toggle"));
    expect(within(dialog()).queryAllByTestId("photo-viewer-marker")).toHaveLength(0);
    get.mockRestore();
    set.mockRestore();
  });

  it("closes with Klar", () => {
    const onClose = vi.fn();
    render(<Viewer onClose={onClose} />);
    fireEvent.click(within(dialog()).getByRole("button", { name: "Klar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("says so, with no numbers, when the photo cannot be shown", () => {
    const onPhotoError = vi.fn();
    render(<Viewer onPhotoError={onPhotoError} />);
    fireEvent.error(within(dialog()).getByRole("img"));
    expect(onPhotoError).toHaveBeenCalledTimes(1);
    expect(within(dialog()).getByRole("status")).toHaveTextContent("Fotot kunde inte visas.");
    expect(within(dialog()).queryByTestId("photo-viewer")).toBeNull();
    expect(within(dialog()).getByRole("button", { name: "Ta bort fotot" })).toBeInTheDocument();
  });
});
