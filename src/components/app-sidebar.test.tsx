import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AppSidebar } from "./app-sidebar";
import { renderWithRouter } from "../test/test-utils";

describe("AppSidebar", () => {
  it("renders brand and nav items", () => {
    renderWithRouter(<AppSidebar />);

    expect(screen.getByText("Skillone")).toBeInTheDocument();
    expect(screen.getByText("我的 Skills")).toBeInTheDocument();
    expect(screen.getByText("添加 Skills")).toBeInTheDocument();
    expect(screen.getByText("标签")).toBeInTheDocument();
    expect(screen.getByText("工具")).toBeInTheDocument();
    expect(screen.getByText("更新")).toBeInTheDocument();
    expect(screen.getByText("设置")).toBeInTheDocument();
  });

  it("renders count badges where defined", async () => {
    renderWithRouter(<AppSidebar />);

    // The 我的 Skills / 我的 Agents badges show the (mock) counts once loaded.
    expect(await screen.findByText("6")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("46")).toBeInTheDocument(); // 工具
  });

  it("marks the active route link", () => {
    renderWithRouter(<AppSidebar />, { route: "/my-skills" });

    const link = screen.getByRole("link", { name: /我的 Skills/ });
    expect(link.className).toContain("bg-muted");
  });

  it("collapses and expands via the toggle", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AppSidebar />);

    const toggle = screen.getByTitle("折叠侧边栏");
    await user.click(toggle);

    // Labels are hidden while collapsed.
    expect(screen.queryByText("我的 Skills")).not.toBeInTheDocument();
    expect(screen.getByTitle("展开侧边栏")).toBeInTheDocument();

    await user.click(screen.getByTitle("展开侧边栏"));
    expect(screen.getByText("我的 Skills")).toBeInTheDocument();
  });
});
