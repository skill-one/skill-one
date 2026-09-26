import { describe, expect, it } from "vitest";
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
  it("calls the field up with Cmd+K: focus moves and the query is selected", () => {
    renderSearchField({ value: "pdf" });
    const field = screen.getByLabelText(
      "搜索 Skill",
    ) as HTMLInputElement;

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    expect(field).toHaveFocus();
    expect(field).toHaveDisplayValue("pdf");
    // The selection, not the focus alone, is the point: the keystroke a reader
    // types next replaces the question they were asking, with no backspacing.
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(3);
  });

  it("answers Ctrl+K too, where there is no command key", () => {
    renderSearchField();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(screen.getByLabelText("搜索 Skill")).toHaveFocus();
  });

  it("leaves plain K alone — only the shortcut's key opens the field", async () => {
    const user = userEvent.setup();
    renderSearchField();

    await user.keyboard("k");

    expect(screen.getByLabelText("搜索 Skill")).not.toHaveFocus();
  });

  it("keeps the shortcut from a locked field", () => {
    renderSearchField({ disabled: true });

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    expect(screen.getByLabelText("搜索 Skill")).not.toHaveFocus();
  });

  it("shows the shortcut where the hint sits, and only while the field is open", () => {
    const { unmount } = renderSearchField();

    expect(screen.getByText("Ctrl")).toBeInTheDocument();

    unmount();
    renderSearchField({ disabled: true });

    // A locked field has no shortcut to offer, so the hint goes with it.
    expect(screen.queryByText("Ctrl")).not.toBeInTheDocument();
  });
});
