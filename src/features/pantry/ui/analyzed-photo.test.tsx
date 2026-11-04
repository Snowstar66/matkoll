import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnalyzedPhotoSheet, PhotoCrop, ReviewPhotoPanel } from "./analyzed-photo";

// The photo sheet of Story 6.6 on its own: during review it looks as before,
// and Story 10.2 gives it its own subtitle, alt text, error text and content
// under the photo for the latest saved photo.

const photo = { url: "blob:photo", size: { width: 720, height: 900 }, numbers: { kind: "none" as const } };
const sheet = (name = "Fotot av kylen") => screen.getByRole("dialog", { name });

describe("AnalyzedPhotoSheet", () => {
  it("looks as during review without the new props", () => {
    render(<AnalyzedPhotoSheet photo={photo} location="Kyl" open onClose={vi.fn()} />);
    expect(sheet()).toHaveAccessibleDescription(
      "Jämför förslagen med fotot. Det sparas som senaste foto när du bekräftar något.",
    );
    expect(within(sheet()).getByRole("img", { name: "Fotot av kylen som förslagen kommer från" })).toHaveAttribute(
      "src",
      "blob:photo",
    );
    fireEvent.error(within(sheet()).getByRole("img"));
    expect(within(sheet()).getByText("Fotot kunde inte visas.")).toBeInTheDocument();
  });

  it("takes a subtitle, an alt text, an error text and content under the photo (Story 10.2)", () => {
    const onPhotoError = vi.fn();
    render(
      <AnalyzedPhotoSheet
        photo={photo}
        location="Frys"
        open
        onClose={vi.fn()}
        subtitle="Taget idag 15:42."
        alt="Senaste fotot av frysen"
        errorText="Fotot finns inte längre."
        onPhotoError={onPhotoError}
      >
        <p>Under fotot</p>
      </AnalyzedPhotoSheet>,
    );
    const dialog = sheet("Fotot av frysen");
    expect(dialog).toHaveAccessibleDescription("Taget idag 15:42.");
    const image = within(dialog).getByRole("img", { name: "Senaste fotot av frysen" });
    expect(within(dialog).getByText("Under fotot")).toBeInTheDocument();
    // The content comes after the photo.
    expect(image.compareDocumentPosition(within(dialog).getByText("Under fotot")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.error(image);
    expect(onPhotoError).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByText("Fotot finns inte längre.")).toBeInTheDocument();
    // The content stays when the photo cannot be shown.
    expect(within(dialog).getByText("Under fotot")).toBeInTheDocument();
  });
});

describe("ReviewPhotoPanel (Kylfoto D)", () => {
  const panel = () => screen.getByTestId("pantry-review-photo");
  const box = () => panel().firstElementChild as HTMLElement;

  it("sticks on top at 330 px and shrinks to 200 px once the list scrolls under it, and back at the top", () => {
    render(
      <ReviewPhotoPanel photo={photo} location="Kyl" markers={[]} selected={null} onSelectMarker={vi.fn()} onOpen={vi.fn()} />,
    );
    expect(panel()).toHaveClass("sticky");
    expect(box().style.height).toBe("330px");
    const sentinel = panel().previousElementSibling as HTMLElement;
    const at = (top: number) => {
      sentinel.getBoundingClientRect = () => ({ top }) as DOMRect;
      fireEvent.scroll(window);
    };
    at(-200);
    expect(box().style.height).toBe("200px");
    expect(panel()).toHaveAttribute("data-mini", "true");
    at(10);
    expect(box().style.height).toBe("330px");
  });

  it("opens full screen from a tap on the photo, and says so when it cannot be shown", () => {
    const onOpen = vi.fn();
    const onPhotoError = vi.fn();
    render(
      <ReviewPhotoPanel
        photo={photo}
        location="Kyl"
        markers={[]}
        selected={null}
        onSelectMarker={vi.fn()}
        onOpen={onOpen}
        onPhotoError={onPhotoError}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Fotot av kylen, visa större" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.error(panel().querySelector("img")!);
    expect(onPhotoError).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Fotot kunde inte visas.")).toBeInTheDocument();
  });
});

describe("PhotoCrop (Kylfoto D)", () => {
  it("shows the photo around the point, enlarged, with the marker on the point", () => {
    render(<PhotoCrop url="blob:photo" x={694} y={583} number={3} />);
    const crop = screen.getByTestId("pantry-sheet-crop");
    expect(crop).toHaveAttribute("aria-hidden", "true");
    expect(crop.style.backgroundSize).toMatch(/^250%( auto)?$/);
    expect(crop.style.backgroundPosition).toBe("69.4% 58.3%");
    expect(crop).toHaveClass("h-[120px]");
    const marker = crop.querySelector("span")!;
    expect(marker).toHaveTextContent("3");
    expect(marker.style.left).toMatch(/69.4%/);
  });
});
