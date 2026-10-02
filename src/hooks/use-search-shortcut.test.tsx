import { describe, expect, it, beforeEach } from "vitest";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";

import { useSearchShortcut } from "./use-search-shortcut";
import { SearchInput } from "../components/search-input";
import { resetSearchShortcut } from "../lib/search-shortcut";

let currentPath: string;

function LocationProbe() {
  currentPath = useLocation().pathname;
  return null;
}

/** The hook as the shell mounts it: inside the router, on a route of its own. */
function renderShortcut(route = "/") {
  return renderHook(() => useSearchShortcut(), {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[route]}>
        {children}
        <LocationProbe />
      </MemoryRouter>
    ),
  });
}

/** A list's own field, mounted the way a list page mounts it. */
function renderField(props: { disabled?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <SearchInput
        value="pdf"
        onChange={() => {}}
        label="搜索 Skill"
        {...props}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  resetSearchShortcut();
  currentPath = "";
});

/** The route the reader is on, as the router last reported it. */
function path(): string {
  return currentPath;
}

describe("useSearchShortcut", () => {
  it("focuses the field of the list already on screen", () => {
    renderField();
    renderShortcut("/installed");
    const before = path();

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    // The list the reader is already reading is the one that answers, and the
    // keystroke typed next replaces the question already in the field — so
    // nothing navigates and nothing is asked for.
    expect(screen.getByLabelText("搜索 Skill")).toHaveFocus();
    expect(path()).toBe(before);
  });

  it("carries the reader into the store's list from a route with no list", () => {
    renderShortcut("/");

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    // The agents graph is a picture, not a list: there is nothing there to
    // search, so the shortcut goes where the answer lives.
    expect(path()).toBe("/explore");
  });

  it("lands the reader in the field, not beside it", () => {
    renderShortcut("/");
    fireEvent.keyDown(window, { key: "k", metaKey: true });

    renderField();

    // The request the shortcut left behind is taken by the field as it mounts.
    expect(screen.getByLabelText("搜索 Skill")).toHaveFocus();
  });

  it("answers Ctrl+K too, and leaves plain K alone", () => {
    renderShortcut("/");

    fireEvent.keyDown(window, { key: "k" });
    expect(path()).toBe("/");

    fireEvent.keyDown(window, { key: "K", metaKey: true });
    expect(path()).toBe("/explore");
  });

  it("leaves a locked field to the index it is waiting for", () => {
    renderField({ disabled: true });
    renderShortcut("/explore");
    const before = path();

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    // Nothing to type into yet, so the shortcut neither focuses the closed
    // field nor sends the reader off to look for another one.
    expect(screen.getByLabelText("搜索 Skill")).not.toHaveFocus();
    expect(path()).toBe(before);
  });

  it("stops the browser's own reading of the shortcut", () => {
    renderShortcut("/installed");

    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    // In a browser build Cmd/Ctrl+K belongs to the address bar, which is never
    // what was meant inside an app window.
    expect(event.defaultPrevented).toBe(true);
  });
});
