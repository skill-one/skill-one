import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

import { fetchSkillsPage } from "./lib/skills-api";
import App from "./App";

vi.mock("./lib/skills-api", () => ({ fetchSkillsPage: vi.fn() }));

// The real persister would read/write localStorage during provider restoration;
// stub it with a no-op persister so the routing tests stay deterministic and
// never touch Node's experimental localStorage getter.
vi.mock("@tanstack/query-sync-storage-persister", () => ({
  createSyncStoragePersister: vi.fn(() => ({
    persistClient: vi.fn(),
    restoreClient: vi.fn().mockResolvedValue(undefined),
    removeClient: vi.fn(),
  })),
}));

const mockCreateSyncStoragePersister = vi.mocked(createSyncStoragePersister);
const mockFetchSkillsPage = vi.mocked(fetchSkillsPage);

// Keep the ExplorePage query pending so its async state update never fires
// outside act() in these routing-only tests.
mockFetchSkillsPage.mockImplementation(() => new Promise(() => {}));

describe("App routing", () => {
  afterEach(() => {
    // Reset the hash so each test starts from a clean route.
    window.location.hash = "";
    mockFetchSkillsPage.mockReset();
    mockFetchSkillsPage.mockImplementation(() => new Promise(() => {}));
  });

  it("persists the query cache to localStorage", async () => {
    render(<App />);

    // The sync-storage persister is wired up once at module load.
    expect(mockCreateSyncStoragePersister).toHaveBeenCalledTimes(1);

    // Await the provider's async restore so its state update settles inside
    // act() and doesn't leak a warning.
    await screen.findByRole("tab", { name: "在线探索" });
  });

  it("redirects the root route to /explore", async () => {
    render(<App />);

    // ExplorePage renders its source tabs once the route lands.
    expect(
      await screen.findByRole("tab", { name: "在线探索" }),
    ).toBeInTheDocument();
  });

  it("navigates to My Skills via the sidebar", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("link", { name: /我的 Skills/ }));

    // MySkillsPage renders its subtitle.
    expect(
      await screen.findByText("管理已安装的技能：检查来源、更新或移除。"),
    ).toBeInTheDocument();
  });

  it("navigates to My Agents via the sidebar", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("link", { name: /我的 Agents/ }));

    // MyAgentsPage renders its subtitle.
    expect(
      await screen.findByText(
        "查看各 AI 编码代理的 skills 目录链接状态，并将它们的 skills 目录链接到统一位置。",
      ),
    ).toBeInTheDocument();
  });

  it("redirects unknown routes back to /explore", async () => {
    window.location.hash = "#/does-not-exist";
    render(<App />);

    expect(
      await screen.findByRole("tab", { name: "在线探索" }),
    ).toBeInTheDocument();
  });
});
