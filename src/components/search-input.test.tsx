import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SearchInput } from "./search-input";
import { renderWithRouter } from "../test/test-utils";

function renderSearchField(
  props: Partial<Parameters<typeof SearchInput>[0]> = {},
) {
  return renderWithRouter(
    <SearchInput value="" onChange={() => {}} label="搜索 Skill" {...props} />,
  );
}

describe("SearchInput", () => {
  it("shows every keystroke at once, and asks the list once the word settles", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    // The field is controlled by its caller, so the honest test drives it the
    // way the row does: the query it keeps is the query the field shows.
    function Controlled() {
      const [value, setValue] = useState("");
      return (
        <SearchInput
          value={value}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
          label="搜索 Skill"
        />
      );
    }
    renderWithRouter(<Controlled />);
    const field = screen.getByLabelText("搜索 Skill");

    await user.type(field, "pdf");

    // The word under the cursor belongs to the reader and is on screen
    // keystroke by keystroke: what the list does with it may never lag behind
    // their own fingers.
    expect(field).toHaveValue("pdf");
    // The list, on the other hand, is asked about the *word* — three keystrokes
    // are one question, and re-answering a list of hundreds of rows per
    // character is the one cost a search field must not add.
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith("pdf");
  });

  it("asks about the word as it settled, not as it was left mid-word", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderSearchField({ onChange });

    // The last word of a run is the question; the half-words before it were
    // never answers to anything, and re-asking for each would put three round
    // trips where one belongs.
    await user.type(screen.getByLabelText("搜索 Skill"), "pd");

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith("pd");
  });

  it("follows a question asked from elsewhere", () => {
    const { rerender } = renderSearchField({ value: "pdf" });
    expect(screen.getByLabelText("搜索 Skill")).toHaveValue("pdf");

    // A deep link from the popover writes the shared view, and the field shows
    // the word the list is answering: it holds the word being written, not a
    // private draft of its own.
    rerender(
      <SearchInput value="excel" onChange={() => {}} label="搜索 Skill" />,
    );
    expect(screen.getByLabelText("搜索 Skill")).toHaveValue("excel");
  });

  it("hands the word over even if the field goes away mid-word", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { unmount } = renderSearchField({ onChange });

    await user.type(screen.getByLabelText("搜索 Skill"), "pd");
    unmount();

    // The shared view outlives the page that wrote it (see `lib/list-view`), so
    // a reader who leaves inside the settle window must not lose the question
    // they just asked — dropping it would be the cheaper bug to fix and the
    // more annoying one to hit.
    expect(onChange).toHaveBeenCalledWith("pd");
  });

  it("shows what it searches as the hint, and lets a caller override it", () => {
    const { unmount } = renderSearchField();
    expect(screen.getByPlaceholderText("搜索 Skill...")).toBeInTheDocument();

    unmount();
    renderSearchField({ placeholder: "索引构建中…" });
    expect(screen.getByPlaceholderText("索引构建中…")).toBeInTheDocument();
  });

  it("locks the field while what it searches is unavailable", () => {
    renderSearchField({ disabled: true });

    const field = screen.getByLabelText("搜索 Skill");
    expect(field).toBeDisabled();
    fireEvent.change(field, { target: { value: "pdf" } });
    // A locked field says nothing, and holds nothing either: there is nothing
    // to search yet, so there is no word to write down.
    expect(field).toHaveValue("");
  });

  it("leaves the keyboard alone — there is no shortcut to the field", () => {
    const { container } = renderSearchField({ value: "pdf" });
    const field = screen.getByLabelText("搜索 Skill");

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(field).not.toHaveFocus();
    // Scoped to what this component rendered, so the claim is about the
    // field's own output rather than about whatever the document holds.
    expect(container.querySelector("kbd")).toBeNull();
  });

  it("takes the size the row gives it", () => {
    renderSearchField({ className: "w-full max-w-sm" });

    // Where the field sits in its row is the row's decision (see
    // `ListToolbar`), so the field takes the size it is handed rather than
    // holding a width of its own.
    expect(screen.getByLabelText("搜索 Skill").parentElement).toHaveClass(
      "w-full",
      "max-w-sm",
    );
  });
});
