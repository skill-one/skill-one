import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ListToolbar } from "./list-toolbar";
import { getListView, resetListView, setScope } from "../lib/list-view";
import { resetSearchShortcut } from "../lib/search-shortcut";
import { renderWithRouter } from "../test/test-utils";

/**
 * `ready` is the only thing the row asks of the worker, and it is what locks the
 * store's field until the index over the registry exists.
 */
const { registrySnapshot } = vi.hoisted(() => ({
  registrySnapshot: { ready: true } as { ready: boolean },
}));

vi.mock("../lib/registry/client", () => ({
  getRegistrySnapshot: () => registrySnapshot,
  subscribeRegistry: () => () => {},
}));

const FACETS = [
  { key: "development", count: 12 },
  { key: "testing", count: 8 },
];

function row(props: Partial<Parameters<typeof ListToolbar>[0]> = {}) {
  return (
    <ListToolbar destination="installed" facets={FACETS} total={20} {...props} />
  );
}

function renderRow(props: Partial<Parameters<typeof ListToolbar>[0]> = {}) {
  return renderWithRouter(row(props));
}

/** The trailing cluster, where the two switches are docked. */
function cluster(): HTMLElement {
  const element = screen.getByRole("button", { name: "排序方式" }).parentElement;
  if (!element) throw new Error("no cluster rendered");
  return element;
}

beforeEach(() => {
  registrySnapshot.ready = true;
  resetListView();
  resetSearchShortcut();
});

describe("ListToolbar", () => {
  it("reads left to right as the reading does: query, scope, order", () => {
    renderRow();

    const field = screen.getByLabelText("搜索 Skill");
    const picker = screen.getByRole("button", { name: "分类" });
    const sort = screen.getByRole("button", { name: "排序方式" });

    // Search names what the reader wants, the picker narrows the answer, the
    // switch says what order it reads in — the pipeline in that order, with the
    // field on the leading edge and the two view controls docked to the
    // trailing one, which is where list toolbars put them everywhere.
    expect(
      field.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      picker.compareDocumentPosition(sort) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("stands the three as one tight group, and leaves the slack over", () => {
    renderRow();

    // The field takes the same `max-w-sm` box the component library caps its
    // own fields at, and the two facts about the answer stand right beside it —
    // one cluster, read as a single toolbar, with the row's slack left over.
    // Nothing here invents a width: the input's own `w-full` does the filling.
    expect(screen.getByLabelText("搜索 Skill").parentElement).toHaveClass(
      "w-full",
      "max-w-sm",
    );
    // Nothing pushes the pair to the far edge: that is the arrangement this row
    // deliberately does not take, and `ml-auto` is how it would be taken.
    expect(cluster()).not.toHaveClass("ml-auto");
    expect(cluster().parentElement).toBe(
      screen.getByLabelText("搜索 Skill").parentElement?.parentElement,
    );
  });

  it("never lets the two view controls be the ones squeezed", () => {
    renderRow();

    // On a narrow window the field gives way before the switches do — they are
    // two short words, and a truncated "排序方…" is worse than a shorter field.
    for (const name of ["分类", "排序方式"]) {
      expect(screen.getByRole("button", { name })).toHaveClass("shrink-0");
    }
    expect(cluster()).toHaveClass("shrink-0");
  });

  it("locks the other two while a search is live, and leaves the row standing", () => {
    const { rerender } = renderRow();
    const before = cluster().parentElement;

    // A row that emptied itself on the first keystroke would pull the field out
    // from under the reader's cursor, so the other two say so where they stand:
    // the very same elements, in the very same row.
    rerender(row({ searching: true }));

    expect(screen.getByRole("button", { name: "分类" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "排序方式" })).toBeDisabled();
    expect(cluster().parentElement).toBe(before);
  });

  it("keeps the field open under a live search — it is what is answering", () => {
    renderRow({ searching: true });

    // Only the other two stand down: the field is the reader's own, and a
    // search that locked its own field could not be typed into.
    expect(screen.getByLabelText("搜索 Skill")).toBeEnabled();
  });

  it("hands the switches back when the search clears", () => {
    const { rerender } = renderRow({ searching: true });

    expect(screen.getByRole("button", { name: "分类" })).toBeDisabled();

    rerender(row());

    expect(screen.getByRole("button", { name: "分类" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "排序方式" })).toBeEnabled();
  });

  it("holds the scope and the order in the shared view, not in the row", async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByRole("button", { name: "分类" }));
    await user.click(
      await screen.findByRole("menuitemradio", { name: /^开发编程/ }),
    );
    await user.click(screen.getByRole("button", { name: "排序方式" }));
    await user.click(
      await screen.findByRole("menuitemradio", { name: "按仓库" }),
    );

    // A list the reader left and came back to is still scoped and sorted as they
    // left it, because the state outlives the page that set it.
    expect(getListView().views.installed).toEqual({
      sort: "repo",
      scope: "development",
    });
  });

  it("keeps each list's own scope and order to itself", async () => {
    const user = userEvent.setup();
    const { unmount } = renderRow();

    await user.click(screen.getByRole("button", { name: "排序方式" }));
    await user.click(
      await screen.findByRole("menuitemradio", { name: "按仓库" }),
    );
    unmount();
    renderRow({ destination: "store", sorts: ["popularity", "repo"] });

    // The store never took the installed list's pick, and its own menu offers
    // only the orders its rows can state — the default, in the state the rows
    // display.
    expect(getListView().views.store).toEqual({});
    expect(screen.getByRole("button", { name: "排序方式" })).toHaveTextContent(
      "热度",
    );
  });

  it("has no picker for a list with nothing to scope", () => {
    renderRow({ facets: [], total: 0 });

    // Nothing to narrow to, so there is no control that would narrow.
    expect(screen.queryByRole("button", { name: "分类" })).toBeNull();
    expect(screen.getByRole("button", { name: "排序方式" })).toBeInTheDocument();
  });

  it("keeps the picker on a scoped list, so the scope can be cleared", () => {
    setScope("installed", "development");
    renderRow({ facets: [], total: 0 });

    // The taxonomy can be empty — a scope nothing answers to any more — but the
    // picker is also how a scope is cleared, so a list holding one keeps it.
    expect(screen.getByRole("button", { name: "分类" })).toBeInTheDocument();
  });

  it("locks the store's field until the index over the registry is ready", () => {
    registrySnapshot.ready = false;
    renderRow({ destination: "store", sorts: ["popularity", "repo"] });

    // A query must never be answered over a partially downloaded registry, and
    // the field says why it is closed instead of sitting there mute.
    expect(screen.getByLabelText("搜索 Skill")).toBeDisabled();
    expect(screen.getByPlaceholderText("索引构建中…")).toBeInTheDocument();
  });

  it("leaves the installed list's field open — that list is already in memory", () => {
    registrySnapshot.ready = false;
    renderRow();

    expect(screen.getByLabelText("搜索 Skill")).toBeEnabled();
  });
});
