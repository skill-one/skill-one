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

/** The header element itself, which is what the row and its drag region are about. */
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

  it("closes the row with the settings entry, and holds no field of its own", () => {
    renderHeader("/explore");

    // Settings answer to the window, so they are the one action the chrome
    // keeps. The list's own controls moved down to the list (see
    // `ListToolbar`), so the row has no input left in it.
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(header().querySelector("input")).toBeNull();
  });

  it("leaves the list's controls to the page", () => {
    renderHeader("/explore");

    // The search field, the scope picker and the sort switch each answer to one
    // list, so each belongs to the row above that list — not to chrome that is
    // the same on every route, where they would answer for a list that is not
    // the one on screen.
    expect(screen.queryByLabelText("搜索 Skill")).toBeNull();
    expect(screen.queryByRole("button", { name: "分类" })).toBeNull();
    expect(screen.queryByRole("button", { name: "排序方式" })).toBeNull();
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
    // The field belongs to a list, and this route is inside one rather than
    // being one — so there is nothing here to search.
    expect(screen.queryByLabelText("搜索 Skill")).toBeNull();
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
