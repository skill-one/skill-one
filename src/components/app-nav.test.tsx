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

  it("wears the segmented look: a muted track with the marked half raised", () => {
    renderNav("/installed");

    const track = screen.getByRole("navigation", { name: "主导航" });
    const marked = screen.getByRole("link", { name: "已安装" });
    const idle = screen.getByRole("link", { name: "商店" });

    // The shared recipe (see `segmented`), which is the header's own look
    // promoted to the app's: a muted bed with the marked half raised out of it
    // in the surface colour under one quiet shadow. The nav is where the look was
    // decided — the list's shape switch now wears the same one, so the two
    // segmented controls in the window are recognisably siblings.
    expect(track).toHaveClass("bg-muted");
    expect(marked).toHaveClass("bg-background");
    expect(marked).toHaveClass("shadow-sm");
    expect(marked).toHaveClass("text-foreground");
    expect(idle).toHaveClass("text-foreground/60");
    expect(idle).not.toHaveClass("bg-background");
    expect(idle).not.toHaveClass("shadow-sm");
  });

  it("wears the pill the recipe asks for: capsule track, compact halves", () => {
    renderNav("/installed");

    // The recipe's radius is a capsule at every size (`rounded-full` on the track
    // and on the halves), and its height is a 24px half in 12px type — compact
    // enough that the header's row still reads as a row of places rather than of
    // buttons. The mark's half is tighter still, since a glyph needs less air
    // than a word.
    const track = screen.getByRole("navigation", { name: "主导航" });
    expect(track).toHaveClass("rounded-full");
    expect(track).not.toHaveClass("rounded-lg");
    for (const name of ["首页", "商店", "已安装"]) {
      const half = screen.getByRole("link", { name });
      expect(half).toHaveClass("rounded-full", "h-6", "text-xs");
      expect(half).not.toHaveClass("rounded-md");
    }
    expect(screen.getByRole("link", { name: "首页" })).toHaveClass("px-1.5");
    expect(screen.getByRole("link", { name: "商店" })).toHaveClass("px-2.5");
  });

  it("raises exactly the one half the reader is in", () => {
    renderNav("/repo/anthropics/skills");

    // The marked half is raised and the other two are not, so the raised look
    // says which pane is on screen rather than that a control was pressed.
    expect(screen.getByRole("link", { name: "商店" })).toHaveClass(
      "bg-background",
    );
    expect(screen.getByRole("link", { name: "首页" })).not.toHaveClass(
      "bg-background",
    );
    expect(screen.getByRole("link", { name: "已安装" })).not.toHaveClass(
      "bg-background",
    );
  });
});
