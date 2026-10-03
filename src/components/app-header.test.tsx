import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";

import { AppHeader } from "./app-header";
import { TooltipProvider } from "./ui/tooltip";
import { resetListView } from "../lib/list-view";
import { renderWithRouter } from "../test/test-utils";

beforeEach(() => {
  resetListView();
});

/**
 * The header as the app mounts it, under the route the shell resolves, plus a
 * probe that records where the router ended up — the header's own links navigate.
 */
let currentPath: string;
let currentSearch: string;

function LocationProbe() {
  const location = useLocation();
  currentPath = location.pathname;
  currentSearch = location.search;
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

/** The header element itself, which is what the row and its drag region are about. */
function header(): HTMLElement {
  const element = document.querySelector("header");
  if (!element) throw new Error("no header rendered");
  return element;
}

describe("AppHeader", () => {
  it("leads with the destinations and centres the brand", () => {
    renderHeader("/explore");

    expect(screen.getByText("Skill One")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "首页" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "商店" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "已安装" })).toBeInTheDocument();
  });

  it("rides the brand over the row, so the lights' padding cannot push it off centre", () => {
    renderHeader("/explore");

    // The mark is a title, not a leading item: it is centred over the header's
    // own box instead of sharing a flex line whose leading padding (`pl-24`,
    // for the traffic lights) is twice its trailing one.
    const overlay = screen.getByRole("link", { name: "Skill One" })
      .parentElement;
    expect(overlay?.className).toContain("absolute");
    expect(overlay?.className).toContain("inset-0");
    expect(overlay?.className).toContain("justify-center");

    // The row still leads with the destinations, and closes with the actions.
    expect(header().firstElementChild?.tagName).toBe("NAV");
    expect(header().lastElementChild).toContainElement(
      screen.getByRole("button", { name: "设置" }),
    );
  });

  it("points the brand at the home, the agents graph", () => {
    renderHeader("/explore");

    // The mark names the window and is the window's way home.
    expect(screen.getByRole("link", { name: "Skill One" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("closes the row with the search field and the settings entry", () => {
    renderHeader("/explore");

    // The field is here because it answers on every route: it is a jump pad
    // into the search page from anywhere, not a control for one list.
    expect(screen.getByLabelText("搜索 Skill")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
  });

  it("leaves the list's own controls to the page", () => {
    renderHeader("/explore");

    // The scope picker and the sort switch each answer to one list, so each
    // belongs to the row above that list (see `ListToolbar`) — not to chrome
    // that is the same on every route.
    expect(screen.queryByRole("button", { name: "分类" })).toBeNull();
    expect(screen.queryByRole("button", { name: "排序方式" })).toBeNull();
  });

  it("keeps the navigation, the field and settings on a page inside a list", () => {
    renderHeader("/repo/acme/tools");

    // The way out of a drill-down is that page's own head, not the window's
    // chrome; the destinations stay, so the reader can see which list the page
    // belongs to and leave for the other one.
    expect(screen.getByText("Skill One")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "商店" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "返回" })).toBeNull();
    // The field is the window's, so it is here on a drill-down too: the
    // question it asks is asked of every collection at once.
    expect(screen.getByLabelText("搜索 Skill")).toBeInTheDocument();
  });

  it("holds an empty field on a browse route, and the URL's question on the search page", () => {
    // A browse page holds no question, so its copy of the field is empty…
    const { unmount } = renderHeader("/explore");
    expect(screen.getByLabelText("搜索 Skill")).toHaveValue("");
    unmount();

    // …while on the search page the field mirrors the question in the URL, which
    // is what makes a search shareable.
    renderHeader("/search?q=pdf");
    expect(screen.getByLabelText("搜索 Skill")).toHaveValue("pdf");
  });

  it("pushes the search page on the first keystroke, then edits it in place", async () => {
    const user = userEvent.setup();
    renderHeader("/explore");

    await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

    // The first keystroke leaves the browse page for the search page, so the
    // back button has somewhere to return to; later letters edit that one
    // question in place rather than opening an entry per keystroke.
    expect(currentPath).toBe("/search");
    expect(screen.getByLabelText("搜索 Skill")).toHaveValue("pdf");
  });

  it("edits the URL in place on the search page itself, and empties it for no question", async () => {
    const user = userEvent.setup();
    renderHeader("/search?q=pdf");

    await user.clear(screen.getByLabelText("搜索 Skill"));

    // An empty question drops the parameter rather than pinning `?q=` to nothing.
    expect(currentSearch).toBe("");
  });

  it("carries the reader between the two lists", async () => {
    const user = userEvent.setup();
    renderHeader("/explore");

    await user.click(screen.getByRole("link", { name: "已安装" }));

    expect(currentPath).toBe("/installed");
  });

  it("claims the whole row as the window's drag region", () => {
    renderHeader("/explore");

    // `deep` covers the descendants, so the row's empty stretches move the
    // window, while a link or a button still takes its own click.
    expect(header()).toHaveAttribute("data-tauri-drag-region", "deep");
  });
});
