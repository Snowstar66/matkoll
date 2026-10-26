import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnalyzedPhotoSheet } from "./analyzed-photo";

// The photo sheet of Story 6.6 on its own: during review it looks as before,
// and Story 10.2 gives it its own subtitle, alt text, error text and content
// under the photo for the latest saved photo.

const photo = { url: "blob:photo", size: { width: 720, height: 900 } };
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
