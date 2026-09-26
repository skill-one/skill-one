import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { AppNav } from "./app-nav";
import { renderWithRouter } from "../test/test-utils";

/**
 * The nav reads no registry data — it is the two destinations and nothing
 * else — so these tests wrap it in only what the app itself provides.
 */
function renderNav(route = "/") {
  return renderWithRouter(<AppNav />, { route });
}

describe("AppNav", () => {
  it("names both destinations, words only", () => {
    renderNav();

    expect(screen.getByRole("link", { name: "商店" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "我的" })).toBeInTheDocument();
  });

  it("is the app's whole navigation: two destinations and nothing else", () => {
    renderNav();

    // Settings lives beside the nav in the header, not inside it.
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "设置" })).toBeNull();
  });

  it("leaves the brand to the header", () => {
    renderNav();

    // The nav is the two destinations: the brand is the header's own mark.
    expect(screen.queryByText("Skill One")).toBeNull();
  });

  it("marks the active destination", () => {
    renderNav("/my-skills");

    expect(screen.getByRole("link", { name: "我的" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps a destination marked on its own sub-pages", () => {
    renderNav("/my-skills/local");

    // The local pool is a sub-page of the installed list, so the destination it
    // opened from stays lit.
    expect(screen.getByRole("link", { name: "我的" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps the store marked on a repository's page", () => {
    renderNav("/repo/anthropics/skills");

    expect(screen.getByRole("link", { name: "商店" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
