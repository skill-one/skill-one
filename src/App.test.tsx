import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";
import { I18nProvider } from "./i18n/language-provider";

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
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );

    // The sync-storage persister is wired up once at module load.
    expect(persisterWiring.calls).toBe(1);

    // The default route is the home, the agents graph; wait for it to settle.
    await screen.findByText("SkillOne 共享中心");
  });

  it("opens the agents graph at the root route", async () => {
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );

    // The home is the agents page with the central SkillOne hub.
    expect(
      await screen.findByText("SkillOne 共享中心"),
    ).toBeInTheDocument();
  });

  it("navigates between routes via the header", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );

    // 设置 is a menu trigger, not a route: it opens the settings menu
    // in place.
    await user.click(screen.getByRole("button", { name: /设置/ }));
    expect(await screen.findByText("主题")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    // Navigate back to the installed list, the header's 我的技能 segment.
    await user.click(screen.getByRole("link", { name: /^我的技能$/ }));

    expect(await screen.findByText("pdf")).toBeInTheDocument();
  });

  it("redirects unknown routes back to the home", async () => {
    window.location.hash = "#/does-not-exist";
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );

    expect(
      await screen.findByText("SkillOne 共享中心"),
    ).toBeInTheDocument();
  });

  it("asks each list its question on the list's own row", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );

    // The window's chrome holds no question: a field there would be a field
    // whose list is one route away, so it belongs to the list itself.
    expect(screen.queryByLabelText("搜索 Skill")).toBeNull();

    await user.click(screen.getByRole("link", { name: /^我的技能$/ }));
    const field = await screen.findByLabelText("搜索 Skill");
    await user.type(field, "pdf");

    // Asking stays on the list that answers it — no route change and no query
    // parameter: the question is that list's own state (see `lib/list-view`),
    // and the list answers it right there.
    expect(window.location.hash).toContain("/installed");
    expect(field).toHaveValue("pdf");
  });
});
