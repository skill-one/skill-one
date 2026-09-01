import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

import App from "./App";

// The routing tests never need registry data: hold the worker client at its
// initial (empty, not-ready) snapshot so no async data reaches the UI.
// The snapshot must be a stable reference — useSyncExternalStore re-renders
// whenever getSnapshot returns a new object.
const INITIAL_SNAPSHOT = vi.hoisted(() => ({
  count: 0,
  complete: false,
  indexing: false,
  ready: false,
  epoch: 0,
  error: null,
}));

vi.mock("./lib/registry/client", () => ({
  initRegistry: vi.fn(),
  reloadRegistry: vi.fn(),
  getPage: vi.fn(() => new Promise(() => {})),
  getFeatured: vi.fn(() => new Promise(() => {})),
  lookupSkills: vi.fn(() => new Promise(() => {})),
  getRegistrySnapshot: () => INITIAL_SNAPSHOT,
  subscribeRegistry: vi.fn(() => () => {}),
  resetRegistryClient: vi.fn(),
}));

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

describe("App routing", () => {
  afterEach(() => {
    // Reset the hash so each test starts from a clean route.
    window.location.hash = "";
  });

  it("persists the query cache to localStorage", async () => {
    render(<App />);

    // The sync-storage persister is wired up once at module load.
    expect(mockCreateSyncStoragePersister).toHaveBeenCalledTimes(1);

    // Default route is /my-skills; wait for its content to settle.
    await screen.findByText("共 6 个");
  });

  it("redirects the root route to /my-skills", async () => {
    render(<App />);

    // MySkillsPage renders mock skill cards synchronously.
    expect(await screen.findByText("共 6 个")).toBeInTheDocument();
  });

  it("navigates between routes via the sidebar", async () => {
    const user = userEvent.setup();
    render(<App />);

    // Navigate to Settings.
    await user.click(screen.getByRole("link", { name: /设置/ }));

    expect(await screen.findByText(/配置技能数据的下载源/)).toBeInTheDocument();

    // Navigate back to My Skills (全局).
    await user.click(screen.getByRole("link", { name: /全局/ }));

    expect(await screen.findByText("共 6 个")).toBeInTheDocument();
  });

  it("redirects unknown routes back to /my-skills", async () => {
    window.location.hash = "#/does-not-exist";
    render(<App />);

    expect(await screen.findByText("共 6 个")).toBeInTheDocument();
  });
});
