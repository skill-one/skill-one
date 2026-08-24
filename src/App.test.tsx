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

    // Default route is /my-skills; wait for its content to settle.
    await screen.findByText("已安装");
  });

  it("redirects the root route to /my-skills", async () => {
    render(<App />);

    // MySkillsPage renders mock skill cards synchronously.
    expect(await screen.findByText("已安装")).toBeInTheDocument();
  });

  it("navigates between routes via the sidebar", async () => {
    const user = userEvent.setup();
    render(<App />);

    // Navigate to Settings.
    await user.click(screen.getByRole("link", { name: /设置/ }));

    expect(await screen.findByText(/配置技能数据的下载源/)).toBeInTheDocument();

    // Navigate back to My Skills (全局).
    await user.click(screen.getByRole("link", { name: /全局/ }));

    expect(await screen.findByText("已安装")).toBeInTheDocument();
  });

  it("redirects unknown routes back to /my-skills", async () => {
    window.location.hash = "#/does-not-exist";
    render(<App />);

    expect(await screen.findByText("已安装")).toBeInTheDocument();
  });
});
