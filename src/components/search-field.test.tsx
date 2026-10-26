import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchField, type SearchFieldHandle } from "./search-field";

describe("SearchField", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("searches 200 ms after typing stops, once, with the last text", () => {
    const onSearch = vi.fn();
    render(<SearchField label="Sök recept" onSearch={onSearch} />);
    const field = screen.getByRole("searchbox", { name: "Sök recept" });

    fireEvent.change(field, { target: { value: "k" } });
    act(() => vi.advanceTimersByTime(150));
    fireEvent.change(field, { target: { value: "kyc" } });
    act(() => vi.advanceTimersByTime(199));
    expect(onSearch).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("kyc");
  });

  it("clears at once with 'Rensa sökning'", () => {
    const onSearch = vi.fn();
    render(<SearchField label="Sök recept" onSearch={onSearch} defaultValue="lax" />);
    fireEvent.click(screen.getByRole("button", { name: "Rensa sökning" }));
    expect(onSearch).toHaveBeenCalledWith("");
    expect(screen.getByRole("searchbox")).toHaveValue("");
    act(() => vi.advanceTimersByTime(500));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("searches at once on Enter, without a second search later", () => {
    const onSearch = vi.fn();
    render(<SearchField label="Sök recept" onSearch={onSearch} />);
    const field = screen.getByRole("searchbox");
    fireEvent.change(field, { target: { value: "lax" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSearch).toHaveBeenCalledWith("lax");
    act(() => vi.advanceTimersByTime(500));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("searches at once when the text is deleted by keyboard", () => {
    const onSearch = vi.fn();
    render(<SearchField label="Sök recept" onSearch={onSearch} defaultValue="l" />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    expect(onSearch).toHaveBeenCalledWith("");
    act(() => vi.advanceTimersByTime(500));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("can be cleared from outside, at once, with focus back in the field", () => {
    const onSearch = vi.fn();
    const handle = createRef<SearchFieldHandle>();
    render(<SearchField ref={handle} label="Sök recept" onSearch={onSearch} />);
    const field = screen.getByRole("searchbox");
    fireEvent.change(field, { target: { value: "xyz" } });
    act(() => handle.current?.clear());
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("");
    // The pending search for "xyz" never comes.
    act(() => vi.advanceTimersByTime(500));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("passes maxLength on to the input", () => {
    render(<SearchField label="Sök recept" onSearch={() => {}} maxLength={100} />);
    expect(screen.getByRole("searchbox")).toHaveAttribute("maxlength", "100");
  });

  it("uses at least 16 px text so iPhone Safari does not zoom", () => {
    render(<SearchField label="Sök recept" onSearch={() => {}} />);
    expect(screen.getByRole("searchbox").className).toContain("text-body");
  });
});
