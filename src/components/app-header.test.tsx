import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";

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

/**
 * The header as the app mounts it, under the route the shell resolves, plus a
 * probe that records where the router ended up — navigation is part of what
 * the header does now.
 */
let currentPath: string;

function LocationProbe() {
  currentPath = useLocation().pathname;
  return null;
}

function renderHeader(route = "/") {
  return renderWithRouter(
    <TooltipProvider>
      <AppHeader />
      <LocationProbe />
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
  it("leads with the brand and the destinations", () => {
    renderHeader("/explore");

    expect(screen.getByText("Skill One")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "首页" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "商店" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "已安装" })).toBeInTheDocument();
  });

  it("points the brand at the home, the agents graph", () => {
    renderHeader("/explore");

    // The mark names the window and is the window's way home.
    expect(screen.getByRole("link", { name: "Skill One" })).toHaveAttribute(
      "href",
      "/",
    );
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

  it("keeps the navigation, search and settings on a page inside a list", async () => {
    const user = userEvent.setup();
    renderHeader("/repo/acme/tools");

    // The way out of a drill-down is that page's own head, not the window's
    // chrome (see `DrillDownHead`); the destinations stay, so the reader can
    // see which list the page belongs to and leave for the other one. The
    // search field stays too: typing here is a search of the store.
    expect(screen.getByText("Skill One")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "商店" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "返回" })).toBeNull();
    expect(screen.getByLabelText("搜索 Skill")).toBeInTheDocument();

    await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

    // And it lands in the store's list, the same place a search from any
    // other non-list page lands.
    expect(currentPath).toBe("/explore");
  });

  it("carries the reader into the store's list from the home, on the first keystroke", async () => {
    const user = userEvent.setup();
    renderHeader("/");

    await user.type(screen.getByLabelText("搜索 Skill"), "p");

    expect(currentPath).toBe("/explore");
    expect(getListView().query).toBe("p");
  });

  it("does not navigate the store's list onto itself", async () => {
    const user = userEvent.setup();
    renderHeader("/explore");

    await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

    expect(currentPath).toBe("/explore");
  });

  it("filters the installed list in place instead of leaving it", async () => {
    const user = userEvent.setup();
    renderHeader("/installed");

    await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

    expect(currentPath).toBe("/installed");
  });

  it("shows what the other list was searched for: one field, both lists", async () => {
    const user = userEvent.setup();
    const { unmount } = renderHeader("/explore");
    await user.type(screen.getByLabelText("搜索 Skill"), "pdf");
    unmount();

    // The installed list reads the same field, so the reader keeps the question
    // they were asking instead of finding the box emptied for them.
    renderHeader("/installed");
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
    renderHeader("/installed");

    expect(screen.getByLabelText("搜索 Skill")).toBeEnabled();
  });

  it("holds the same lock on the home, whose searches land in the store", () => {
    registrySnapshot.ready = false;
    renderHeader("/");

    // The first keystroke navigates into the store's list, so the home's
    // field is the store's field and waits for the index like it does.
    expect(screen.getByLabelText("搜索 Skill")).toBeDisabled();
  });

  it("hands the raw field value to the store, leaving the debounce to the list", async () => {
    const user = userEvent.setup();
    renderHeader("/installed");

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
  it("maps each route to the list its field answers to", () => {
    expect(headerRoute("/explore")).toEqual({ destination: "store" });
    expect(headerRoute("/installed")).toEqual({ destination: "installed" });
    // The home is the agents graph: a picture, not a list — but the field is
    // on every route now, and a search started there lands in the store.
    expect(headerRoute("/")).toEqual({ destination: "store" });
  });

  it("answers an unknown route with the store, where every search ends", () => {
    expect(headerRoute("/somewhere-else")).toEqual({ destination: "store" });
  });
});
