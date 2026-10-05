import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SelectionActionBar } from "./selection-action-bar";
import { renderWithRouter } from "../test/test-utils";

describe("SelectionActionBar", () => {
  it("renders nothing when count is 0", () => {
    renderWithRouter(
      <SelectionActionBar
        count={0}
        totalCount={5}
        onSelectAll={() => {}}
        onClear={() => {}}
      />,
    );
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("renders toolbar with count and actions when count > 0", async () => {
    const user = userEvent.setup();
    const onSelectAll = vi.fn();
    const onClear = vi.fn();
    const onEnable = vi.fn();
    const onDisable = vi.fn();

    renderWithRouter(
      <SelectionActionBar
        count={2}
        totalCount={5}
        onSelectAll={onSelectAll}
        onClear={onClear}
        onEnable={onEnable}
        onDisable={onDisable}
      />,
    );

    expect(screen.getByRole("toolbar")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /全选|select all/i }));
    expect(onSelectAll).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /启用|enable/i }));
    expect(onEnable).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /停用|disable/i }));
    expect(onDisable).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /取消|cancel/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("opens delete confirmation dialog and triggers onDelete", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    renderWithRouter(
      <SelectionActionBar
        count={3}
        totalCount={5}
        onSelectAll={() => {}}
        onClear={() => {}}
        onDelete={onDelete}
      />,
    );

    const deleteBtn = screen.getByRole("button", { name: /卸载|uninstall/i });
    await user.click(deleteBtn);

    // Dialog appears with confirmation button
    const confirmBtn = screen.getByRole("button", { name: /^卸载$|^uninstall$/i });
    await user.click(confirmBtn);

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("renders tag options grouped by custom/system and selects a tag", async () => {
    const user = userEvent.setup();
    const onTag = vi.fn();

    renderWithRouter(
      <SelectionActionBar
        count={2}
        totalCount={5}
        onSelectAll={() => {}}
        onClear={() => {}}
        availableTags={[
          { key: "my-tag", label: "My Tag", emoji: "🏷️", isCustom: true },
          { key: "dev", label: "Development", emoji: "💻", isCustom: false },
        ]}
        onTag={onTag}
      />,
    );

    const tagBtn = screen.getByRole("button", { name: /加标签|tag/i });
    await user.click(tagBtn);

    expect(await screen.findByText("My Tag")).toBeInTheDocument();
    expect(screen.getByText("Development")).toBeInTheDocument();

    await user.click(screen.getByText("My Tag"));
    expect(onTag).toHaveBeenCalledWith("my-tag");
  });

  it("supports inline tag creation from the tag popover", async () => {
    const user = userEvent.setup();
    const onCreateTag = vi.fn();

    renderWithRouter(
      <SelectionActionBar
        count={2}
        totalCount={5}
        onSelectAll={() => {}}
        onClear={() => {}}
        availableTags={[{ key: "my-tag", label: "My Tag", isCustom: true }]}
        onTag={() => {}}
        onCreateTag={onCreateTag}
      />,
    );

    const tagBtn = screen.getByRole("button", { name: /加标签|tag/i });
    await user.click(tagBtn);

    const input = screen.getByPlaceholderText(/新建标签|new tag/i);
    await user.type(input, "Work");
    const createBtn = screen.getByRole("button", { name: /^新建$|^create$/i });
    await user.click(createBtn);

    expect(onCreateTag).toHaveBeenCalledWith("Work", undefined);
  });
});
