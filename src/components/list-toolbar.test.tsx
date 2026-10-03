import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ListToolbar } from "./list-toolbar";
import { getListView, resetListView, setScope } from "../lib/list-view";
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

/** The trailing group, where the reading pair is docked: the scope and the
 *  order — the two a live search overrides, so the two that lock under one. Not
 *  the field, and not the shape. */
function docked(): HTMLElement {
  const element = screen.getByRole("button", { name: "排序方式" }).parentElement;
  if (!element) throw new Error("no trailing group rendered");
  return element;
}

/** The shape switch's own group, which stands in the row rather than in `docked`. */
function shapeSwitch(): HTMLElement {
  return screen.getByRole("group", { name: "列表布局" });
}

/** Whether `after` sits later in the document than `before`. */
function standsAfter(before: HTMLElement, after: HTMLElement): boolean {
  return Boolean(
    before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

beforeEach(() => {
  registrySnapshot.ready = true;
  resetListView();
});

describe("ListToolbar", () => {
  it("leads with the field and the shape, and docks the reading pair to the far edge", () => {
    renderRow();

    const field = screen.getByLabelText("搜索 Skill");
    const shape = screen.getByRole("button", { name: "列表" });
    const picker = screen.getByRole("button", { name: "分类" });
    const sort = screen.getByRole("button", { name: "排序方式" });

    // Left to right the row reads: the question, then the shape that says what
    // the answer is made of, then the scope and the order that say how it is
    // narrowed and which way it reads — the pair the tools dock to the trailing
    // edge (MUI's density and columns, Airtable's sort and view options, GitHub's
    // sort on issues).
    expect(standsAfter(field, shape)).toBe(true);
    expect(standsAfter(shape, picker)).toBe(true);
    expect(standsAfter(picker, sort)).toBe(true);
  });

  it("anchors the reading pair to the far edge, clear of the shape", () => {
    renderRow();

    // The shape keeps its own width on the leading edge, and the scope and the
    // order are pushed out by `ml-auto` — so the row lands where those toolbars
    // land instead of trailing slack after one tight cluster.
    expect(shapeSwitch().parentElement).toBe(docked().parentElement);
    expect(docked()).toHaveClass("ml-auto");
    expect(docked()).not.toContainElement(shapeSwitch());
  });

  it("never lets the switches be squeezed", () => {
    renderRow();

    // Every switch is two or three short words, and a truncated "排序方…" is
    // worse than anything else on the row giving ground.
    for (const name of ["列表", "分类", "排序方式"]) {
      expect(screen.getByRole("button", { name })).toHaveClass("shrink-0");
    }
    expect(shapeSwitch()).toHaveClass("shrink-0");
    expect(docked()).toHaveClass("shrink-0");
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

  it("reads the shape as its own answer, whichever way the row is arranged", async () => {
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

  it("leads with the field, right of nothing and left of the shape", () => {
    renderRow();

    const field = screen.getByLabelText("搜索 Skill");
    const shape = screen.getByRole("button", { name: "列表" });

    // The question and the shape are the pair a live search does not override,
    // so they lead the row together; the field is first because it is the
    // question everything else on the row answers into.
    expect(standsAfter(field, shape)).toBe(true);
    expect(standsAfter(shape, screen.getByRole("button", { name: "分类" }))).toBe(
      true,
    );
  });

  it("holds each list's own question, and never the other's", async () => {
    const user = userEvent.setup();
    const { unmount } = renderRow();

    await user.type(screen.getByLabelText("搜索 Skill"), "pdf");
    unmount();
    renderRow({ destination: "store", sorts: ["popularity"] });

    // The store's field answers the registry and the installed list's answers
    // what this machine has — two answers, so neither inherits the other's
    // question (see `lib/list-view`).
    expect(getListView().views.installed.query).toBe("pdf");
    expect(screen.getByLabelText("搜索 Skill")).toHaveValue("");
  });

  it("locks the scope and the order while a question is live", () => {
    renderRow({ searching: true });

    // A search re-ranks the list by relevance and ignores the taxonomy slice, so
    // a pick now would promise narrowing and ranking the answer does not have.
    // Locked, not removed: the row holds still under the reader's cursor.
    expect(screen.getByRole("button", { name: "分类" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "排序方式" })).toBeDisabled();
    // The shape is not one of the two a search overrides, so it stays open: a
    // search is read in either arrangement.
    expect(screen.getByRole("button", { name: "卡片" })).toBeEnabled();
  });

  it("locks the store's field until its index exists, and says why", () => {
    registrySnapshot.ready = false;
    renderRow({ destination: "store", sorts: ["popularity"] });

    // A question answered over a half-downloaded registry answers wrongly, so the
    // store waits for the index — and states the wait rather than refusing in
    // silence. The installed list is already in memory and never waits.
    expect(screen.getByLabelText("搜索 Skill")).toBeDisabled();
    expect(screen.getByLabelText("搜索 Skill")).toHaveAttribute(
      "placeholder",
      "索引构建中…",
    );
  });

  it("asks the installed list before the index is ready, it being in memory", () => {
    registrySnapshot.ready = false;
    renderRow();

    expect(screen.getByLabelText("搜索 Skill")).toBeEnabled();
  });
});
