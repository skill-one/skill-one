import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { AppNav } from "./app-nav";
import { TooltipProvider } from "./ui/tooltip";
import { renderWithRouter } from "../test/test-utils";

/**
 * The nav reads no registry data — it is the three destinations and nothing
 * else — so these tests wrap it in only what the app itself provides; the
 * tooltip provider is the app root's, backing the home mark's tip.
 */
function renderNav(route = "/") {
  return renderWithRouter(
    <TooltipProvider>
      <AppNav />
    </TooltipProvider>,
    { route },
  );
}

describe("AppNav", () => {
  it("names the destinations: a home mark beside two words", () => {
    renderNav();

    expect(screen.getByRole("link", { name: "首页" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "商店" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "已安装" })).toBeInTheDocument();
  });

  it("is the app's whole navigation: every place and nothing else", () => {
    renderNav();

    // Settings lives beside the nav in the header, not inside it.
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "设置" })).toBeNull();
  });

  it("leaves the brand to the header", () => {
    renderNav();

    // The nav is the destinations: the brand is the header's own mark.
    expect(screen.queryByText("Skill One")).toBeNull();
  });

  it("marks the home while the reader is home", () => {
    renderNav("/");

    expect(screen.getByRole("link", { name: "首页" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("marks the active destination", () => {
    renderNav("/installed");

    expect(screen.getByRole("link", { name: "已安装" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps a destination marked on its own sub-pages", () => {
    renderNav("/installed/agents");

    // The agents graph is a sub-page of the installed list, so the destination
    // it opened from stays lit.
    expect(screen.getByRole("link", { name: "已安装" })).toHaveAttribute(
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
