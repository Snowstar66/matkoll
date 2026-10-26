import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom has <dialog> but not its modal methods; a minimal stand-in for the Sheet tests.
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
    // Like browsers: focus moves to the first focusable element inside.
    this.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")?.focus();
  };
  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.requestClose) {
  // A close request the browser starts (Esc, back gesture): `cancel` first, then close unless prevented.
  HTMLDialogElement.prototype.requestClose = function requestClose(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    if (this.dispatchEvent(new Event("cancel", { cancelable: true }))) this.close();
  };
}
// FixedAction measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  disconnect() {}
  unobserve() {}
};
