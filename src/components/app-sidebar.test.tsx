import { beforeEach, describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";

import { fetchSkillsPage } from "../lib/skills-api";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider } from "./ui/sidebar";
import { renderWithRouter } from "../test/test-utils";

vi.mock("../lib/skills-api", () => ({ fetchSkillsPage: vi.fn() }));

const mockFetchSkillsPage = vi.mocked(fetchSkillsPage);

function renderSidebar(route = "/") {
  return renderWithRouter(
    <SidebarProvider>
      <AppSidebar />
    </SidebarProvider>,
    { route },
  );
}

beforeEach(() => {
  mockFetchSkillsPage.mockReset();
  // Registry reports 400 skills total, so the 全部 badge shows 400.
  mockFetchSkillsPage.mockResolvedValue({
    skills: [],
    hasMore: false,
    total: 400,
  });
});

describe("AppSidebar", () => {
  it("renders brand and nav items", () => {
    renderSidebar();

    expect(screen.getByText("skillone")).toBeInTheDocument();
    expect(screen.getByText("精选")).toBeInTheDocument();
    expect(screen.getByText("官方")).toBeInTheDocument();
    expect(screen.getByText("全部")).toBeInTheDocument();
    expect(screen.getByText("全局")).toBeInTheDocument();
    expect(screen.getByText("项目")).toBeInTheDocument();
    expect(screen.getByText("设置")).toBeInTheDocument();
  });

  it("shows the registry total on 全部, installed count on 全局", async () => {
    renderSidebar();

    // Mock skills are installed (see ../lib/mock-local): only 全部 shows the
    // registry total (400); 精选/官方/项目 are unimplemented and show none.
    expect(await screen.findByText("400")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.queryByText("12")).not.toBeInTheDocument();
  });

  it("omits badges for unimplemented pages and hides badges before data loads", async () => {
    mockFetchSkillsPage.mockImplementation(() => new Promise(() => {}));
    renderSidebar();

    // No registry data yet → no 400 badge; installed skills render sync from
    // the mock store, so 全局 still shows 6.
    expect(screen.queryByText("400")).not.toBeInTheDocument();
    expect(await screen.findByText("6")).toBeInTheDocument();
  });

  it("marks the active route link", () => {
    renderSidebar("/my-skills");

    const link = screen.getByRole("link", { name: /全局/ });
    expect(link).toHaveAttribute("data-active", "true");
    expect(link).toHaveAttribute("aria-current", "page");
  });
});
