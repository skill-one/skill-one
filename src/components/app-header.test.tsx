import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { AppHeader, headerRoute } from "./app-header";
import { renderWithRouter } from "../test/test-utils";

/** The header as the app mounts it, under the route the shell resolves. */
function renderHeader(route = "/") {
  return renderWithRouter(<AppHeader />, { route });
}

/** The header element itself, which is what the row count is about. */
function header(): HTMLElement {
  const element = document.querySelector("header");
  if (!element) throw new Error("no header rendered");
  return element;
}

describe("AppHeader", () => {
  it("leads with the brand and opens the row with the search field", () => {
    renderHeader("/explore");

    expect(screen.getByText("Skill One")).toBeInTheDocument();
    expect(screen.getByLabelText("搜索 Skill")).toBeInTheDocument();
  });

  it("closes the row with the unit switch, after the field", () => {
    renderHeader("/explore");

    const field = screen.getByLabelText("搜索 Skill");
    const unit = screen.getByRole("button", { name: "按技能" });

    // How the list reads is the last thing on the row: the switch trails the
    // field it re-answers.
    expect(
      field.compareDocumentPosition(unit) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("leaves the scope chips to the page", () => {
    renderHeader("/explore");

    // The chips narrow the list they sit on, so they open that list's content.
    // The header holds only what both lists share.
    expect(screen.queryByRole("button", { name: /更多分类/ })).toBeNull();
    expect(header().querySelector("button[aria-label*='全部']")).toBeNull();
  });

  it("swaps the row for a drill-down's way back", () => {
    renderHeader("/repo/acme/tools");

    // The mark and one word, pointing at the list this page hangs off.
    expect(screen.getByRole("link", { name: "返回" })).toHaveAttribute(
      "href",
      "/explore",
    );
    // A single repository has nothing to search and nothing to scope, so the
    // header is just the way back.
    expect(screen.queryByLabelText("搜索 Skill")).toBeNull();
    expect(screen.queryByRole("button", { name: "按技能" })).toBeNull();
  });
});

describe("headerRoute", () => {
  it("maps each route to what the header holds", () => {
    expect(headerRoute("/explore")).toEqual({ destination: "store" });
    expect(headerRoute("/my-skills")).toEqual({ destination: "installed" });
    expect(headerRoute("/repo/acme/tools")).toEqual({
      back: { fallback: "/explore" },
    });
    expect(headerRoute("/my-skills/local")).toEqual({
      back: { fallback: "/my-skills" },
    });
  });

  it("leaves the row empty for a route it does not know", () => {
    expect(headerRoute("/somewhere-else")).toEqual({});
  });
});
