import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ListToolbar } from "./list-toolbar";
import { getListView, setQuery, setScope, resetListView } from "../lib/list-view";
import { renderWithRouter } from "../test/test-utils";

/**
 * `ready` is the only thing the toolbar asks of the worker, and it is what
 * locks the store's field until the index over the registry exists. One stable
 * object, because the hook reads it through `useSyncExternalStore`.
 */
const { registrySnapshot } = vi.hoisted(() => ({
  registrySnapshot: { ready: true } as { ready: boolean },
}));

vi.mock("../lib/registry/client", () => ({
  getRegistrySnapshot: () => registrySnapshot,
  subscribeRegistry: () => () => {},
}));

beforeEach(() => {
  registrySnapshot.ready = true;
  resetListView();
});

describe("ListToolbar", () => {
  it("shows what the other list was searched for: one field, both lists", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithRouter(<ListToolbar destination="store" />);
    await user.type(screen.getByLabelText("搜索 Skill"), "pdf");
    unmount();

    // The installed list reads the same field, so the reader keeps the question
    // they were asking instead of finding the box emptied for them.
    renderWithRouter(<ListToolbar destination="installed" />);
    expect(screen.getByLabelText("搜索 Skill")).toHaveValue("pdf");
  });

  it("switches this list's unit, and only this list's", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ListToolbar destination="store" />);

    await user.click(screen.getByRole("button", { name: "按技能" }));

    expect(getListView().views.store.unit).toBe("skill");
    expect(getListView().views.installed.unit).toBe("repo");
  });

  it("keeps the list's scope while a search is typed", async () => {
    const user = userEvent.setup();
    setScope("store", "development");
    renderWithRouter(<ListToolbar destination="store" />);

    await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

    // The chips stand down while a search is live, but the scope they set is
    // kept: clearing the search hands the reader back the list they had.
    expect(getListView().views.store.scope).toBe("development");
  });

  it("locks the store's field until the index over the registry is ready", () => {
    registrySnapshot.ready = false;
    renderWithRouter(<ListToolbar destination="store" />);

    // A query must never be answered over a partial registry.
    expect(screen.getByLabelText("搜索 Skill")).toBeDisabled();
    expect(screen.getByPlaceholderText("索引构建中…")).toBeInTheDocument();
  });

  it("leaves the installed list's field open — that list is already in memory", () => {
    registrySnapshot.ready = false;
    renderWithRouter(<ListToolbar destination="installed" />);

    expect(screen.getByLabelText("搜索 Skill")).toBeEnabled();
  });

  it("hands the raw field value to the store, leaving the debounce to the list", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ListToolbar destination="installed" />);

    await user.type(screen.getByLabelText("搜索 Skill"), "pd");

    // Every keystroke lands: the store holds what the reader typed, and each
    // page debounces it for its own query.
    expect(getListView().query).toBe("pd");

    // And the field follows the store, not just its own keystrokes — it is a
    // reader of the shared view, like the pages are.
    act(() => setQuery(""));
    expect(screen.getByLabelText("搜索 Skill")).toHaveValue("");
  });
});
