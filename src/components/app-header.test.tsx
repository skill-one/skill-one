import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { AppHeader, headerRoute } from "./app-header";
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

  it("puts a list's own controls in the header, and no way back", () => {
    renderHeader("/explore");

    expect(screen.getByLabelText("搜索 Skill")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "按技能" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "返回商店" })).toBeNull();
  });

  it("puts the way back in the header on a page inside a list", () => {
    renderHeader("/repo/acme/tools");

    expect(screen.getByRole("link", { name: "返回商店" })).toHaveAttribute(
      "href",
      "/explore",
    );
    // A single repository has nothing to search, so the field is not there to
    // be typed into and answered wrongly.
    expect(screen.queryByLabelText("搜索 Skill")).toBeNull();
  });
});

describe("headerRoute", () => {
  it("maps each route to what its middle slot holds", () => {
    expect(headerRoute("/explore")).toEqual({ destination: "store" });
    expect(headerRoute("/my-skills")).toEqual({ destination: "installed" });
    expect(headerRoute("/repo/acme/tools")).toEqual({
      back: { fallback: "/explore", label: "返回商店" },
    });
    expect(headerRoute("/my-skills/local")).toEqual({
      back: { fallback: "/my-skills", label: "返回我的 skills" },
    });
  });

  it("leaves the slot empty for a route it does not know", () => {
    expect(headerRoute("/somewhere-else")).toEqual({});
  });
});
