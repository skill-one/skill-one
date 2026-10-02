import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SearchInput } from "./search-input";
import { renderWithRouter } from "../test/test-utils";

function renderSearchField(props: Partial<Parameters<typeof SearchInput>[0]> = {}) {
  return renderWithRouter(
    <SearchInput value="" onChange={() => {}} label="搜索 Skill" {...props} />,
  );
}

describe("SearchInput", () => {
  it("hands every field value up as it stands — debouncing is the caller's", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    // The field is controlled by its caller, so the honest test drives it the
    // way the header does: the query it keeps is the query the field shows.
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

    await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

    // One call per keystroke, each carrying the field as it stands — not the
    // typed character, and not a debounced query the caller has to wait for.
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenLastCalledWith("pdf");
    expect(screen.getByLabelText("搜索 Skill")).toHaveValue("pdf");
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
    // A locked field says nothing, so the query never leaves it.
    expect(field).toHaveValue("");
  });

  it("leaves the keyboard alone — there is no shortcut to the field", () => {
    renderSearchField({ value: "pdf" });
    const field = screen.getByLabelText("搜索 Skill");

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(field).not.toHaveFocus();
    expect(document.querySelector("kbd")).toBeNull();
  });
});