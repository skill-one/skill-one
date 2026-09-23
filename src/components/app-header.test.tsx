import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { AppHeader } from "./app-header";
import { TooltipProvider } from "./ui/tooltip";
import { renderWithRouter } from "../test/test-utils";

/**
 * The header reads no registry data — it is navigation plus a settings entry —
 * so these tests wrap it in only what the app itself provides around it.
 */
function renderHeader(route = "/") {
  return renderWithRouter(
    <TooltipProvider>
      <AppHeader />
    </TooltipProvider>,
    { route },
  );
}

describe("AppHeader", () => {
  it("renders the brand, both destinations and the settings entry", () => {
    renderHeader();

    expect(screen.getByText("Skill One")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "商店" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "我的 skills" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
  });

  it("is the app's whole navigation: two destinations and nothing else", () => {
    renderHeader();

    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("marks the active destination", () => {
    renderHeader("/my-skills");

    const link = screen.getByRole("link", { name: "我的 skills" });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("keeps a destination marked on its sub-pages", () => {
    renderHeader("/my-skills/local");

    // The local pool is a sub-page of the installed list, so the destination
    // it opened from stays lit.
    expect(screen.getByRole("link", { name: "我的 skills" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
