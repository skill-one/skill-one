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
  const location = useLocation();
  currentPath = location.pathname;
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

/**
 * The header element itself, which is what the row and its drag region are
 * about. A top-level `<header>` maps to the `banner` role, so this is a
 * semantic query rather than a `document.querySelector("header")` that would
 * reach past the render into whatever else the document holds.
 */
function header(): HTMLElement {
  return screen.getByRole("banner");
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
    const brand = screen.getByText("Skill One");
    const overlay = brand.parentElement?.parentElement;
    expect(overlay?.className).toContain("absolute");
    expect(overlay?.className).toContain("inset-0");
    expect(overlay?.className).toContain("justify-center");

    // `inset-0` spans the header's whole width, not the mark's, and the
    // overlay paints after the nav — so without this it sat on top of every
    // nav link and swallowed its clicks. The app was unusable while every test
    // in this file stayed green, because jsdom does no hit testing. The mark
    // stays under it: a title, not a link — the drag region it frees up is
    // most of the row's middle.
    expect(overlay).toHaveClass("pointer-events-none");

    // The row still leads with the destinations, and closes with the actions.
    expect(header().firstElementChild?.tagName).toBe("NAV");
    expect(header().lastElementChild).toContainElement(
      screen.getByRole("button", { name: "设置" }),
    );
  });

  it("leaves the way home to the nav's own segment", () => {
    renderHeader("/explore");

    // One destination, one door: the home already leads the segmented nav
    // (and reads as active when it is on screen), so the centred brand is a
    // title rather than a second link to the same place.
    expect(screen.getByRole("link", { name: "首页" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.queryByRole("link", { name: "Skill One" })).toBeNull();
  });

  it("closes the row with the settings entry", () => {
    renderHeader("/explore");

    // The row closes with what is the window's own. The search field is not it:
    // a field here would be a field whose list is one route away (see the note
    // on `AppHeader`), so each list asks and answers its own question on its own
    // row.
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.queryByLabelText("搜索 Skill")).toBeNull();
  });

  it("leaves the list's own controls to the page", () => {
    renderHeader("/explore");

    // The question, the scope picker and the sort switch each answer to one
    // list, so each belongs to the row above that list (see `ListToolbar`) — not
    // to chrome that is the same on every route.
    expect(screen.queryByLabelText("搜索 Skill")).toBeNull();
    expect(screen.queryByRole("button", { name: "分类" })).toBeNull();
    expect(screen.queryByRole("button", { name: "排序方式" })).toBeNull();
  });

  it("keeps the navigation and settings on a page inside a list", () => {
    renderHeader("/repo/acme/tools");

    // The way out of a drill-down is that page's own head, not the window's
    // chrome; the destinations stay, so the reader can see which list the page
    // belongs to and leave for the other one.
    expect(screen.getByText("Skill One")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "商店" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "返回" })).toBeNull();
    // A drill-down is inside one repository's list, so it inherits that list's
    // controls rather than the window's — there is nothing here to ask a
    // question of.
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
