import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

    expect(screen.getByText("Skillone")).toBeInTheDocument();
    expect(screen.getByText("我的 Skills")).toBeInTheDocument();
    expect(screen.getByText("添加 Skills")).toBeInTheDocument();
    expect(screen.getByText("标签")).toBeInTheDocument();
    expect(screen.getByText("工具")).toBeInTheDocument();
    expect(screen.getByText("更新")).toBeInTheDocument();
    expect(screen.getByText("设置")).toBeInTheDocument();
  });

  it("renders count badges where defined", async () => {
    renderSidebar();

    // The 我的 Skills / 我的 Agents badges show the (mock) counts once loaded.
    expect(await screen.findByText("6")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("46")).toBeInTheDocument(); // 工具
  });

  it("marks the active route link", () => {
    renderSidebar("/my-skills");

    const link = screen.getByRole("link", { name: /我的 Skills/ });
    expect(link).toHaveAttribute("data-active", "true");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("collapses and expands via the toggle", async () => {
    const user = userEvent.setup();
    renderSidebar();

    const toggle = screen.getByTitle("折叠侧边栏");
    await user.click(toggle);

    // Labels are unmounted while collapsed.
    expect(screen.queryByText("我的 Skills")).not.toBeInTheDocument();
    expect(screen.getByTitle("展开侧边栏")).toBeInTheDocument();

    await user.click(screen.getByTitle("展开侧边栏"));
    expect(screen.getByText("我的 Skills")).toBeInTheDocument();
  });
});
