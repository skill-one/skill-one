import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
  revalidateRegistry: vi.fn(() => new Promise(() => {})),
  searchSkills: vi.fn(() => new Promise(() => {})),
  lookupSkills: vi.fn(() => new Promise(() => {})),
  // The store's own two answers. They stay pending: these tests drive real
  // routing, not the worker, and a page that never resolves is a page that
  // never needs data.
  getGroups: vi.fn(() => new Promise(() => {})),
  getRepoSections: vi.fn(() => new Promise(() => {})),
  getRegistrySnapshot: () => INITIAL_SNAPSHOT,
  subscribeRegistry: vi.fn(() => () => {}),
  resetRegistryClient: vi.fn(),
}));

// The live skills.sh answer is a plain upstream request and not this file's
// subject, so it stays pending rather than reaching the network.
vi.mock("./lib/skills-sh", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/skills-sh")>()),
  searchSkillsSh: vi.fn(() => new Promise(() => {})),
}));

// Vitest 5 clears mock history before every test (`clearMocks` defaults to
// true), which would wipe the module-load call into the factory below before
// the assertion runs. Count the wiring-up in a plain object instead: it is not
// a mock, so that reset leaves it alone.
const persisterWiring = vi.hoisted(() => ({ calls: 0 }));

// The real persister would read/write localStorage during provider restoration;
// stub it with a no-op persister so the routing tests stay deterministic and
// never touch Node's experimental localStorage getter.
vi.mock("@tanstack/query-sync-storage-persister", () => ({
  createSyncStoragePersister: vi.fn(() => {
    persisterWiring.calls += 1;
    return {
      persistClient: vi.fn(),
      restoreClient: vi.fn().mockResolvedValue(undefined),
      removeClient: vi.fn(),
    };
  }),
}));

describe("App routing", () => {
  afterEach(() => {
    // Reset the hash so each test starts from a clean route.
    window.location.hash = "";
  });

  it("persists the query cache to localStorage", async () => {
    render(<App />);

    // The sync-storage persister is wired up once at module load.
    expect(persisterWiring.calls).toBe(1);

    // Default route is /my-skills; wait for its content to settle.
    await screen.findByText("pdf");
  });

  it("redirects the root route to /my-skills", async () => {
    render(<App />);

    // MySkillsPage renders mock skill rows synchronously.
    expect(await screen.findByText("pdf")).toBeInTheDocument();
  });

  it("navigates between routes via the rail", async () => {
    const user = userEvent.setup();
    render(<App />);

    // 设置 is a popover trigger, not a route: it opens the quick-settings
    // flyout in place.
    await user.click(screen.getByRole("button", { name: /设置/ }));
    expect(await screen.findByText("外观")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    // Navigate back to the installed list, the rail's 我的.
    await user.click(screen.getByRole("link", { name: /^我的$/ }));

    expect(await screen.findByText("pdf")).toBeInTheDocument();
  });

  it("redirects unknown routes back to /my-skills", async () => {
    window.location.hash = "#/does-not-exist";
    render(<App />);

    expect(await screen.findByText("pdf")).toBeInTheDocument();
  });

  it("keeps one search across both lists", async () => {
    const user = userEvent.setup();
    render(<App />);

    // The field is the header's, and there is one of it: the question it holds
    // follows the reader instead of being emptied for them.
    await user.type(await screen.findByLabelText("搜索 Skill"), "pdf");

    await user.click(screen.getByRole("link", { name: /商店/ }));
    expect(screen.getByLabelText("搜索 Skill")).toHaveValue("pdf");

    await user.click(screen.getByRole("link", { name: /^我的$/ }));

    // Still the reader's question, and live on the list it was typed on: the
    // installed list answers it. The page debounces the field it reads, so the
    // answer lands a beat after the value does.
    expect(screen.getByLabelText("搜索 Skill")).toHaveValue("pdf");
    await waitFor(() =>
      expect(screen.queryByText("docx")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("pdf")).toBeInTheDocument();
  });
});
