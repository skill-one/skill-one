import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AppHeader, headerRoute } from "./app-header";
import { TooltipProvider } from "./ui/tooltip";
import { getListView, setQuery, resetListView } from "../lib/list-view";
import { renderWithRouter } from "../test/test-utils";

/**
 * `ready` is the only thing the header asks of the worker, and it is what locks
 * the store's field until the index over the registry exists. One stable
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

/** The header as the app mounts it, under the route the shell resolves. */
function renderHeader(route = "/") {
  return renderWithRouter(
    <TooltipProvider>
      <AppHeader />
    </TooltipProvider>,
    { route },
  );
}

/** The header element itself, which is what the row count is about. */
function header(): HTMLElement {
  const element = document.querySelector("header");
  if (!element) throw new Error("no header rendered");
  return element;
}

describe("AppHeader", () => {
  it("leads with the brand and the two destinations", () => {
    renderHeader("/explore");

    expect(screen.getByText("Skill One")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "商店" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "我的" })).toBeInTheDocument();
  });

  it("closes the row with the search field, then the settings entry", () => {
    renderHeader("/explore");

    const field = screen.getByLabelText("搜索 Skill");
    const settings = screen.getByRole("button", { name: "设置" });

    // The field answers to the list; settings answer to the window, so the
    // field comes first and settings close the row.
    expect(
      field.compareDocumentPosition(settings) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("leaves the scope chips and the unit switch to the page", () => {
    renderHeader("/explore");

    // The chips narrow the list they sit on and the switch says how it reads,
    // so both open that list's content; the header holds the window's chrome.
    expect(screen.queryByRole("button", { name: /更多分类/ })).toBeNull();
    expect(header().querySelector("button[aria-label*='全部']")).toBeNull();
    expect(screen.queryByRole("button", { name: "按技能" })).toBeNull();
  });

  it("keeps the navigation and settings on a page inside a list", () => {
    renderHeader("/repo/acme/tools");

    // The way out of a drill-down is that page's own head, not the window's
    // chrome (see `DrillDownHead`); the destinations stay, so the reader can
    // see which list the page belongs to and leave for the other one.
    expect(screen.getByText("Skill One")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "商店" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "返回" })).toBeNull();
    expect(screen.queryByLabelText("搜索 Skill")).toBeNull();
  });

  it("shows what the other list was searched for: one field, both lists", async () => {
    const user = userEvent.setup();
    const { unmount } = renderHeader("/explore");
    await user.type(screen.getByLabelText("搜索 Skill"), "pdf");
    unmount();

    // The installed list reads the same field, so the reader keeps the question
    // they were asking instead of finding the box emptied for them.
    renderHeader("/my-skills");
    expect(screen.getByLabelText("搜索 Skill")).toHaveValue("pdf");
  });

  it("locks the store's field until the index over the registry is ready", () => {
    registrySnapshot.ready = false;
    renderHeader("/explore");

    // A query must never be answered over a partial registry.
    expect(screen.getByLabelText("搜索 Skill")).toBeDisabled();
    expect(screen.getByPlaceholderText("索引构建中…")).toBeInTheDocument();
  });

  it("leaves the installed list's field open — that list is already in memory", () => {
    registrySnapshot.ready = false;
    renderHeader("/my-skills");

    expect(screen.getByLabelText("搜索 Skill")).toBeEnabled();
  });

  it("hands the raw field value to the store, leaving the debounce to the list", async () => {
    const user = userEvent.setup();
    renderHeader("/my-skills");

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

describe("headerRoute", () => {
  it("maps each route to what the header holds", () => {
    expect(headerRoute("/explore")).toEqual({ destination: "store" });
    expect(headerRoute("/my-skills")).toEqual({ destination: "installed" });
    // A page inside a list loses only the search field: it opens with its own
    // head, way back and all.
    expect(headerRoute("/repo/acme/tools")).toEqual({});
    expect(headerRoute("/my-skills/repo/acme/tools")).toEqual({});
    expect(headerRoute("/my-skills/local")).toEqual({});
  });

  it("leaves the row without a search field for a route it does not know", () => {
    expect(headerRoute("/somewhere-else")).toEqual({});
  });
});
