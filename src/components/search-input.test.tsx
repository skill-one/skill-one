import { useState } from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SearchInput } from "./search-input";
import {
  focusSearchField,
  requestSearchField,
  resetSearchShortcut,
} from "../lib/search-shortcut";
import { renderWithRouter } from "../test/test-utils";

function renderSearchField(
  props: Partial<Parameters<typeof SearchInput>[0]> = {},
) {
  return renderWithRouter(
    <SearchInput value="" onChange={() => {}} label="搜索 Skill" {...props} />,
  );
}

describe("SearchInput", () => {
  it("hands up every keystroke, leaving the debounce to the list", async () => {
    const user = userEvent.setup();
    const typed: string[] = [];

    // A field that is really controlled, the way the row holds it: what the
    // reader typed is what the field shows, and every step of it was reported.
    function Harness() {
      const [value, setValue] = useState("");
      return (
        <SearchInput
          value={value}
          onChange={(next) => {
            typed.push(next);
            setValue(next);
          }}
          label="搜索 Skill"
        />
      );
    }
    renderWithRouter(<Harness />);

    await user.type(screen.getByLabelText("搜索 Skill"), "pd");

    // The field is not a store of the query: it reports what was typed, and the
    // row that owns it decides what that means for the answer below — including
    // when to ask.
    expect(typed).toEqual(["p", "pd"]);
    expect(screen.getByLabelText("搜索 Skill")).toHaveValue("pd");
  });

  it("shows the shortcut where the hint sits, and only while the field is open", () => {
    const { unmount } = renderSearchField();

    expect(screen.getByText("Ctrl")).toBeInTheDocument();

    unmount();
    renderSearchField({ disabled: true });

    // A locked field has no shortcut to offer, so the hint goes with it.
    expect(screen.queryByText("Ctrl")).not.toBeInTheDocument();
  });

  it("takes the size the row gives it", () => {
    renderSearchField({ className: "min-w-0 max-w-sm flex-1" });

    // Where the field sits in its row is the row's decision, so the field takes
    // the size it is handed rather than holding a width of its own.
    expect(screen.getByLabelText("搜索 Skill").parentElement).toHaveClass(
      "min-w-0",
      "max-w-sm",
      "flex-1",
    );
  });

  it("answers the shortcut pressed before it was on screen", () => {
    resetSearchShortcut();
    // The reader pressed Cmd/Ctrl+K on the agents graph, where there is no list
    // to search; the row they land on takes the waiting request.
    requestSearchField();
    renderSearchField({ value: "pdf" });
    const field = screen.getByLabelText("搜索 Skill") as HTMLInputElement;

    expect(field).toHaveFocus();
    // The selection, not the focus alone, is the point: the keystroke typed
    // next replaces the question already being asked, with no backspacing.
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(3);
  });

  it("does not take the cursor when nothing asked for it", () => {
    resetSearchShortcut();
    renderSearchField();

    expect(screen.getByLabelText("搜索 Skill")).not.toHaveFocus();
  });

  it("leaves a locked field alone, however it was asked for", () => {
    resetSearchShortcut();
    requestSearchField();
    renderSearchField({ disabled: true });

    // A field that cannot answer yet must not look like one waiting to be
    // filled: the index over the registry is still building.
    expect(screen.getByLabelText("搜索 Skill")).not.toHaveFocus();
  });

  it("releases the shortcut when the list goes away", () => {
    resetSearchShortcut();
    const { unmount } = renderSearchField();

    expect(focusSearchField()).toBe(true);

    unmount();

    // Nothing is on screen to search, so the shortcut says so rather than
    // focusing a field that is no longer there.
    expect(focusSearchField()).toBe(false);
  });
});
