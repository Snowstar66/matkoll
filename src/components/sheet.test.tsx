import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Sheet } from "./sheet";

function Harness({
  isDirty = false,
  preventClose = false,
  onClose,
}: {
  isDirty?: boolean;
  preventClose?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Importera recept
      </button>
      <Sheet
        open={open}
        title="Importera recept"
        isDirty={isDirty}
        preventClose={preventClose}
        closeLabel="Avbryt"
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
      >
        <label>
          Länk
          <input />
        </label>
      </Sheet>
    </>
  );
}

async function openSheet() {
  const user = userEvent.setup();
  const opener = screen.getByRole("button", { name: "Importera recept" });
  await user.click(opener);
  return { user, opener };
}

const dialog = () => screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement;

describe("Sheet", () => {
  it("opens as a modal dialog named by its title", async () => {
    render(<Harness />);
    expect(dialog().open).toBe(false);
    await openSheet();
    expect(dialog().open).toBe(true);
    expect(screen.getByRole("dialog", { name: "Importera recept" })).toBeInTheDocument();
    expect(screen.getByLabelText("Länk")).toBeInTheDocument();
  });

  it("closes with Esc and gives focus back to the button that opened it", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const { user, opener } = await openSheet();
    await user.click(screen.getByLabelText("Länk"));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog().open).toBe(false);
    expect(opener).toHaveFocus();
  });

  it("closes with the header button", async () => {
    render(<Harness />);
    const { user, opener } = await openSheet();
    await user.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(dialog().open).toBe(false);
    expect(opener).toHaveFocus();
  });

  it("closes on a tap outside, on the veil, but not inside", async () => {
    render(<Harness />);
    const { user } = await openSheet();
    await user.click(screen.getByLabelText("Länk"));
    expect(dialog().open).toBe(true);
    fireEvent.pointerDown(dialog());
    fireEvent.click(dialog());
    expect(dialog().open).toBe(false);
  });

  it("closes on a downward swipe on its top, not on a short one", async () => {
    render(<Harness />);
    await openSheet();
    const handle = screen.getByTestId("sheet-handle");
    fireEvent.touchStart(handle, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(handle, { touches: [{ clientY: 130 }] });
    fireEvent.touchEnd(handle, { changedTouches: [{ clientY: 130 }] });
    expect(dialog().open).toBe(true);
    fireEvent.touchStart(handle, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(handle, { touches: [{ clientY: 220 }] });
    fireEvent.touchEnd(handle, { changedTouches: [{ clientY: 220 }] });
    expect(dialog().open).toBe(false);
  });

  it("asks 'Släng ändringarna?' before closing with unsaved changes", async () => {
    const onClose = vi.fn();
    render(<Harness isDirty onClose={onClose} />);
    const { user, opener } = await openSheet();
    await user.type(screen.getByLabelText("Länk"), "https://koket.se/x");
    await user.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Släng ändringarna?");

    // Going back keeps what was typed.
    await user.click(screen.getByRole("button", { name: "Fortsätt ändra" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Länk")).toHaveValue("https://koket.se/x");

    await user.click(screen.getByRole("button", { name: "Avbryt" }));
    await user.click(screen.getByRole("button", { name: "Släng ändringarna" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog().open).toBe(false);
    expect(opener).toHaveFocus();
  });

  it("goes back to the field that had focus when Pontus keeps editing", async () => {
    render(<Harness isDirty />);
    const { user } = await openSheet();
    await user.click(screen.getByLabelText("Länk"));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Fortsätt ändra" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Länk")).toHaveFocus();
  });

  it("goes back to the close button when nothing inside had focus", async () => {
    render(<Harness isDirty />);
    const { user } = await openSheet();
    await user.click(screen.getByRole("button", { name: "Avbryt" }));
    await user.click(screen.getByRole("button", { name: "Fortsätt ändra" }));
    expect(screen.getByRole("button", { name: "Avbryt" })).toHaveFocus();
  });

  it("asks before a close request from the browser (cancel) on a dirty sheet", async () => {
    const onClose = vi.fn();
    render(<Harness isDirty onClose={onClose} />);
    await openSheet();
    act(() => dialog().requestClose());
    expect(dialog().open).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Släng ändringarna?");
  });

  it("closes on a close request from the browser when clean", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await openSheet();
    act(() => dialog().requestClose());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog().open).toBe(false);
  });

  it("follows a close the browser carried out: clean closes, dirty reopens and asks", async () => {
    const clean = vi.fn();
    const { unmount } = render(<Harness onClose={clean} />);
    await openSheet();
    act(() => dialog().close());
    expect(clean).toHaveBeenCalledTimes(1);
    expect(dialog().open).toBe(false);
    unmount();

    const dirty = vi.fn();
    render(<Harness isDirty onClose={dirty} />);
    await openSheet();
    act(() => dialog().close());
    expect(dirty).not.toHaveBeenCalled();
    expect(dialog().open).toBe(true);
    expect(screen.getByRole("alert")).toHaveTextContent("Släng ändringarna?");
  });

  it("cannot be closed while preventClose is set", async () => {
    const onClose = vi.fn();
    render(<Harness preventClose onClose={onClose} />);
    const { user } = await openSheet();
    expect(screen.getByRole("button", { name: "Avbryt" })).toBeDisabled();
    await user.keyboard("{Escape}");
    fireEvent.pointerDown(dialog());
    fireEvent.click(dialog());
    act(() => dialog().requestClose());
    act(() => dialog().close());
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog().open).toBe(true);
  });

  describe("never stacked", () => {
    function Two({ firstDirty = false }: { firstDirty?: boolean }) {
      const [first, setFirst] = useState(false);
      const [second, setSecond] = useState(false);
      return (
        <main id="innehall" tabIndex={-1}>
          <button type="button" onClick={() => setFirst(true)}>
            Lägg till vara
          </button>
          <Sheet open={first} title="Första" isDirty={firstDirty} onClose={() => setFirst(false)}>
            <button type="button" onClick={() => setSecond(true)}>
              Öppna nästa
            </button>
          </Sheet>
          <Sheet open={second} title="Andra" onClose={() => setSecond(false)}>
            <p>Innehåll</p>
          </Sheet>
        </main>
      );
    }

    const dialogs = () => (screen.getAllByRole("dialog", { hidden: true }) as HTMLDialogElement[]).map((d) => d.open);

    it("opening a second sheet replaces the first, and focus returns to the first one's opener", async () => {
      render(<Two />);
      const user = userEvent.setup();
      const opener = screen.getByRole("button", { name: "Lägg till vara" });
      await user.click(opener);
      await user.click(screen.getByRole("button", { name: "Öppna nästa" }));
      expect(dialogs()).toEqual([false, true]);
      expect(opener).not.toHaveFocus();

      await user.keyboard("{Escape}");
      expect(dialogs()).toEqual([false, false]);
      expect(opener).toHaveFocus();
    });

    it("a dirty first sheet asks; 'Fortsätt ändra' keeps it and the second never opens", async () => {
      render(<Two firstDirty />);
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Lägg till vara" }));
      await user.click(screen.getByRole("button", { name: "Öppna nästa" }));
      expect(dialogs()).toEqual([true, false]);
      expect(screen.getByRole("alert")).toHaveTextContent("Släng ändringarna?");

      await user.click(screen.getByRole("button", { name: "Fortsätt ändra" }));
      expect(dialogs()).toEqual([true, false]);
      expect(screen.getByRole("button", { name: "Öppna nästa" })).toHaveFocus();
    });

    it("a dirty first sheet asks; 'Släng ändringarna' closes it and opens the second", async () => {
      render(<Two firstDirty />);
      const user = userEvent.setup();
      const opener = screen.getByRole("button", { name: "Lägg till vara" });
      await user.click(opener);
      await user.click(screen.getByRole("button", { name: "Öppna nästa" }));
      await user.click(screen.getByRole("button", { name: "Släng ändringarna" }));
      expect(dialogs()).toEqual([false, true]);

      await user.keyboard("{Escape}");
      expect(dialogs()).toEqual([false, false]);
      expect(opener).toHaveFocus();
    });

    it("focus falls back to the main content when no opener is left", async () => {
      function Lone() {
        const [open, setOpen] = useState(true);
        return (
          <main id="innehall" tabIndex={-1}>
            <Sheet open={open} title="Ensam" onClose={() => setOpen(false)}>
              <p>Innehåll</p>
            </Sheet>
          </main>
        );
      }
      render(<Lone />);
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Klar" }));
      expect(screen.getByRole("main")).toHaveFocus();
    });
  });
});
