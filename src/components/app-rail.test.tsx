import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { AppRail } from "./app-rail";
import { TooltipProvider } from "./ui/tooltip";
import { renderWithRouter } from "../test/test-utils";

/**
 * The rail reads no registry data — it is navigation plus a settings entry — so
 * these tests wrap it in only what the app itself provides around it.
 */
function renderRail(route = "/") {
  return renderWithRouter(
    <TooltipProvider>
      <AppRail />
    </TooltipProvider>,
    { route },
  );
}

describe("AppRail", () => {
  it("names both destinations", () => {
    renderRail();

    expect(screen.getByRole("link", { name: "商店" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "我的" })).toBeInTheDocument();
  });

  it("leaves the brand to the header", () => {
    renderRail();

    // The rail is navigation: the brand, the list controls and the traffic
    // lights are the header's.
    expect(screen.queryByText("Skill One")).toBeNull();
  });

  it("is the app's whole navigation: two destinations and nothing else", () => {
    renderRail();

    // 设置 is a button, not a destination.
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
  });

  it("marks the active destination", () => {
    renderRail("/my-skills");

    const link = screen.getByRole("link", { name: "我的" });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("keeps a destination marked on its own sub-pages", () => {
    renderRail("/my-skills/local");

    // The local pool is a sub-page of the installed list, so the destination it
    // opened from stays lit.
    expect(screen.getByRole("link", { name: "我的" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps the store marked on a repository's page", () => {
    renderRail("/repo/anthropics/skills");

    expect(screen.getByRole("link", { name: "商店" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("leaves the shared list controls out of it", () => {
    renderRail("/explore");

    // The rail is too narrow for a search field, and those two controls belong
    // to the list on screen: the page renders them (see `ListToolbar`).
    expect(screen.queryByLabelText("搜索 Skill")).toBeNull();
    expect(screen.queryByRole("button", { name: "按技能" })).toBeNull();
  });
});
