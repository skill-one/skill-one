import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";

import { AppSidebar } from "./app-sidebar";
import { SidebarProvider } from "./ui/sidebar";
import { renderWithRouter } from "../test/test-utils";

function renderSidebar(route = "/") {
  return renderWithRouter(
    <SidebarProvider>
      <AppSidebar />
    </SidebarProvider>,
    { route },
  );
}

describe("AppSidebar", () => {
  it("renders brand and nav items", () => {
    renderSidebar();

    expect(screen.getByText("SkillOne")).toBeInTheDocument();
    expect(screen.getByText("精选")).toBeInTheDocument();
    expect(screen.getByText("官方")).toBeInTheDocument();
    expect(screen.getByText("全部")).toBeInTheDocument();
    expect(screen.getByText("全局")).toBeInTheDocument();
    expect(screen.getByText("项目")).toBeInTheDocument();
    expect(screen.getByText("设置")).toBeInTheDocument();
  });

  it("renders count badges where defined", () => {
    renderSidebar();

    // Shop items (精选, 官方, 全部) each show count 12.
    expect(screen.getAllByText("12")).toHaveLength(3);
    // My-skills items (全局, 项目) each show count 3.
    expect(screen.getAllByText("3")).toHaveLength(2);
  });

  it("marks the active route link", () => {
    renderSidebar("/my-skills");

    const link = screen.getByRole("link", { name: /全局/ });
    expect(link).toHaveAttribute("data-active", "true");
    expect(link).toHaveAttribute("aria-current", "page");
  });
});
