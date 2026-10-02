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

  it("holds the scope, the shape and the order in the shared view, not in the row", async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByRole("button", { name: "分类" }));
    await user.click(
      await screen.findByRole("menuitemradio", { name: /^开发编程/ }),
    );
    await user.click(screen.getByRole("button", { name: "卡片" }));

    // A list the reader left and came back to is still scoped and shaped as they
    // left it, because the state outlives the page that set it.
    expect(getListView().views.installed).toEqual({
      scope: "development",
      unit: "repo",
    });
  });

  it("shows both arrangements on the row, and never in a menu", () => {
    renderRow();

    // The shape is the one answer with two values and nothing to name, so both
    // of them stand there: no press to discover which one is on, and no popup
    // between the reader and the arrangement they want.
    for (const name of ["列表", "卡片"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "列表" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "卡片" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("group", { name: "列表布局" })).toBeInTheDocument();
  });

  it("reads the shape as its own answer, and keeps the order beside it", async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByRole("button", { name: "列表" }));
    await user.click(screen.getByRole("button", { name: "排序方式" }));
    await user.click(
      await screen.findByRole("menuitemradio", { name: "安装时间" }),
    );
    await user.click(screen.getByRole("button", { name: "卡片" }));
    await user.click(screen.getByRole("button", { name: "列表" }));

    // Two answers, two values: the shape is where the reader left it and so is
    // the order, because neither one was standing in for the other.
    expect(getListView().views.installed).toEqual({ sort: "installed" });
  });

  it("has no order control for a list that answers in one order", () => {
    renderRow({ destination: "store", sorts: ["popularity"] });

    // The store's rows display the figure they are ordered by, so a menu of one
    // would be a control that costs a press to say what the rows already say.
    expect(
      screen.queryByRole("button", { name: "排序方式" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "卡片" })).toBeInTheDocument();
  });

  it("takes the order control away in the card shape, and gives it back", async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByRole("button", { name: "卡片" }));

    // A card is a repository led by its own stars; an install clock and a token
    // cost are figures the rows carry and the card does not, so the control
    // leaves rather than promise a pick that changes nothing.
    expect(
      screen.queryByRole("button", { name: "排序方式" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "列表" }));

    expect(screen.getByRole("button", { name: "排序方式" })).toBeInTheDocument();
  });

  it("keeps the shape live while a search is live, unlike the scope", () => {
    renderRow({ searching: true });

    // A search answers in sections and those sections are read in the shape the
    // reader chose, so that choice is honoured while a query is live — and the
    // switch that carries it stays open.
    expect(screen.getByRole("button", { name: "分类" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "排序方式" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "卡片" })).toBeEnabled();
  });

  it("keeps each list's own scope, shape and order to itself", async () => {
    const user = userEvent.setup();
    const { unmount } = renderRow();

    await user.click(screen.getByRole("button", { name: "卡片" }));
    unmount();
    renderRow({ destination: "store", sorts: ["popularity"] });

    // The store never took the installed list's shape, and it has no order
    // control of its own to show.
    expect(getListView().views.store).toEqual({});
    expect(screen.getByRole("button", { name: "列表" })).toHaveAttribute(
      "aria-pressed",
      "true",
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
    renderRow({ destination: "store", sorts: ["popularity"] });

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
