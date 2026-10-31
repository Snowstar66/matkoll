import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { CategoryHeader } from "./category-header";
import { CheckCircle } from "./check-circle";
import { ListGroup } from "./list-group";
import { ListRow } from "./list-row";
import { TrashButton } from "./trash-button";

describe("ListGroup", () => {
  it("is a white card list named by the category heading above it", () => {
    render(
      <section aria-labelledby="mejeri">
        <CategoryHeader id="mejeri" category="Mejeri & ägg" count={2} />
        <ListGroup labelledBy="mejeri" data-testid="group">
          <ListRow title="Mellanmjölk" />
          <ListRow title="Ägg" />
        </ListGroup>
      </section>,
    );
    const list = screen.getByRole("list", { name: "Mejeri & ägg" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(list).toHaveClass("bg-surface", "rounded-lg", "divide-y", "divide-hairline", "overflow-hidden");
    expect(list).toHaveAttribute("data-testid", "group");
  });

  it("takes a name of its own when no heading names it", () => {
    render(
      <ListGroup label="I korgen">
        <ListRow title="Citron" />
      </ListGroup>,
    );
    expect(screen.getByRole("list", { name: "I korgen" })).toBeInTheDocument();
  });

  it("has role list, which VoiceOver drops from a ul without list style", () => {
    render(
      <ListGroup label="Kyl">
        <ListRow title="Gurka" />
      </ListGroup>,
    );
    expect(screen.getByRole("list", { name: "Kyl" })).toHaveAttribute("role", "list");
  });
});

describe("ListRow", () => {
  it("with onPress is a button named by the name and the line under it, at least 56 px high", () => {
    const onPress = vi.fn();
    render(
      <ListGroup label="Kyl">
        <ListRow title="Mellanmjölk" meta="Arla laktosfri" onPress={onPress} data-testid="row" />
      </ListGroup>,
    );
    const button = screen.getByRole("button", { name: "Mellanmjölk Arla laktosfri" });
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    const row = screen.getByTestId("row");
    expect(row.tagName).toBe("LI");
    expect(row).toHaveClass("min-h-row");
  });

  it("with href is a link", () => {
    render(
      <ListGroup label="Recept">
        <ListRow title="Korv stroganoff" meta="15 min" href="/recept/1" />
      </ListGroup>,
    );
    expect(screen.getByRole("link", { name: "Korv stroganoff 15 min" })).toHaveAttribute("href", "/recept/1");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("without onPress or href is plain text", () => {
    render(
      <ListGroup label="Kyl">
        <ListRow title="Gurka" meta="Tillagd idag" />
      </ListGroup>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("Gurka Tillagd idag");
  });

  it("stops the line under at two lines with '…' on screen only and lets the name wrap", () => {
    const meta = "Arla laktosfri mellanmjölk 1,5 % i stor förpackning från fotot i kylen";
    const title = "Mycket lång vara med ett namn som inte får plats på en rad";
    render(
      <ListGroup label="Kyl">
        <ListRow title={title} meta={meta} onPress={() => {}} />
      </ListGroup>,
    );
    const metaLine = screen.getByText(meta);
    expect(metaLine).toHaveClass("line-clamp-2", "wrap-break-word", "text-meta", "text-ink-3");
    expect(metaLine).not.toHaveClass("truncate");
    expect(metaLine.textContent).toBe(meta);
    expect(screen.getByText(title)).toHaveClass("text-row-title", "wrap-break-word");
    expect(screen.getByRole("button", { name: `${title} ${meta}` })).toHaveClass("min-w-0", "flex-1");
  });

  it("keeps the controls to the left and right outside the press target", () => {
    const onRemove = vi.fn();
    const onOpen = vi.fn();
    const onChecked = vi.fn();
    render(
      <ListGroup label="Frukt & grönt">
        <ListRow
          title="Gul lök"
          meta="Korv stroganoff"
          onPress={onOpen}
          leading={<CheckCircle checked={false} onCheckedChange={onChecked} label="Gul lök" />}
          trailing={<TrashButton label="Ta bort Gul lök" onPress={onRemove} />}
          pressProps={{ "data-testid": "row-text", "aria-haspopup": "dialog" }}
        />
      </ListGroup>,
    );
    const text = screen.getByTestId("row-text");
    expect(text).toHaveAttribute("aria-haspopup", "dialog");
    expect(within(text).queryByRole("button")).not.toBeInTheDocument();
    expect(within(text).queryByRole("checkbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ta bort Gul lök" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("checkbox", { name: "Gul lök" }));
    expect(onChecked).toHaveBeenCalledWith(true);
    expect(onOpen).not.toHaveBeenCalled();

    // Tab order: the check, the text, the bin.
    const order = [...screen.getByRole("listitem").querySelectorAll("button")];
    expect(order.map((element) => element.getAttribute("aria-label") ?? element.textContent)).toEqual([
      "Gul lök",
      "Gul lök Korv stroganoff",
      "Ta bort Gul lök",
    ]);
  });

  it("strikes a ticked-off name through in ink-3", () => {
    render(
      <ListGroup label="I korgen">
        <ListRow title="Citron" crossedOut />
      </ListGroup>,
    );
    expect(screen.getByText("Citron")).toHaveClass("line-through", "text-ink-3");
  });

  it("can be a div inside a wrapper of the caller's", () => {
    render(
      <ListGroup label="Lista">
        <li>
          <ListRow as="div" title="Vitlök" data-testid="row" />
        </li>
      </ListGroup>,
    );
    expect(screen.getByTestId("row").tagName).toBe("DIV");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("shows a meta of 0 but not an empty one", () => {
    const { rerender } = render(
      <ListGroup label="Kyl">
        <ListRow title="Ägg" meta={0} />
      </ListGroup>,
    );
    expect(screen.getByRole("listitem")).toHaveTextContent("Ägg 0");
    rerender(
      <ListGroup label="Kyl">
        <ListRow title="Ägg" meta="" />
      </ListGroup>,
    );
    expect(screen.getByRole("listitem").querySelectorAll("span")).toHaveLength(1);
  });

  it("is plain text with an empty href", () => {
    render(
      <ListGroup label="Recept">
        <ListRow title="Korv stroganoff" href="" />
      </ListGroup>,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("warns when both onPress and href are set, and when a press target has no name", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const both = { onPress: () => {}, href: "/recept/1" } as unknown as { onPress: () => void };
    render(
      <ListGroup label="Recept">
        <ListRow title="Korv stroganoff" {...both} />
        <ListRow title="" onPress={() => {}} />
        <ListRow title="" onPress={() => {}} pressProps={{ "aria-label": "Öppna varan" }} />
      </ListGroup>,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("both onPress and href"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("needs a title"));
    expect(warn).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Öppna varan" })).toBeInTheDocument();
    warn.mockRestore();
  });

  it("reads a state after the name for screen readers only", () => {
    render(
      <ListGroup label="I korgen">
        <ListRow title="Citron" meta="Korv stroganoff" crossedOut srStatus="i korgen" onPress={() => {}} />
      </ListGroup>,
    );
    expect(screen.getByRole("button", { name: "Citron i korgen Korv stroganoff" })).toBeInTheDocument();
    expect(screen.getByText("i korgen")).toHaveClass("sr-only");
  });

  it("passes pressRef and more attributes to the button or link", () => {
    const buttonRef = createRef<HTMLElement>();
    const linkRef = createRef<HTMLElement>();
    render(
      <ListGroup label="Lista">
        <ListRow
          title="I korgen"
          onPress={() => {}}
          pressRef={buttonRef}
          pressProps={{ "aria-expanded": false, "aria-controls": "korgen", prefetch: false }}
        />
        <ListRow title="Förråd" href="/hemma" pressRef={linkRef} pressProps={{ "aria-current": "page", prefetch: false }} />
      </ListGroup>,
    );
    const button = screen.getByRole("button", { name: "I korgen" });
    expect(buttonRef.current).toBe(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "korgen");
    expect(button).not.toHaveAttribute("prefetch");
    const link = screen.getByRole("link", { name: "Förråd" });
    expect(linkRef.current).toBe(link);
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("draws the focus ring inside the text and the controls", () => {
    render(
      <ListGroup label="Kyl">
        <ListRow
          title="Gurka"
          onPress={() => {}}
          leading={<CheckCircle checked={false} onCheckedChange={() => {}} label="Gurka" />}
          trailing={<TrashButton label="Ta bort Gurka" onPress={() => {}} />}
        />
      </ListGroup>,
    );
    expect(screen.getByRole("button", { name: "Gurka" })).toHaveClass("focus-visible:-outline-offset-2");
    expect(screen.getByRole("checkbox").parentElement).toHaveClass("[&_*:focus-visible]:-outline-offset-2");
    expect(screen.getByRole("button", { name: "Ta bort Gurka" }).parentElement).toHaveClass(
      "[&_*:focus-visible]:-outline-offset-2",
    );
  });
});
