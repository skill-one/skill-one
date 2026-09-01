import { beforeEach, describe, it, expect, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";

import { createRegistryClientMock } from "../test/registry-harness";
import type { RegistryHarness } from "../test/registry-harness";
import type { RegistrySnapshot } from "../lib/registry/client";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider } from "./ui/sidebar";
import { renderWithRouter } from "../test/test-utils";
import type { Skill } from "../types/skill";

/**
 * The registry client is replaced by a real-controller-driven harness, so
 * the badge tests exercise the exact progress events the worker emits.
 */
vi.mock("../lib/registry/client", async () => {
  const { createRegistryHarness, createRegistryClientMock } =
    await import("../test/registry-harness");
  return createRegistryClientMock(createRegistryHarness());
});

const harness = (
  (await import("../lib/registry/client")) as unknown as {
    __harness: RegistryHarness;
  }
).__harness;

/** Minimal registry entries; only the count matters for the badge. */
function registryOf(count: number): Skill[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `skill-${String(i).padStart(3, "0")}`,
    repo: `owner-${i % 7}/repo-${i % 11}`,
    description: "",
    stars: 0,
    downloads: 0,
  }));
}

function renderSidebar(route = "/") {
  return renderWithRouter(
    <SidebarProvider>
      <AppSidebar />
    </SidebarProvider>,
    { route },
  );
}

/** Start the harness and wait for React to observe the given snapshot. */
async function boot(withSkills: Skill[] = []) {
  harness.init();
  // The controller's boot chain is async (cache read → stream start); flush
  // it before pushing, or the first skills would arrive before `onLine`.
  await act(async () => {});
  if (withSkills.length > 0) harness.pushAll(withSkills);
  await act(async () => {});
}

beforeEach(() => {
  harness.reset();
});

describe("AppSidebar", () => {
  it("renders brand and nav items", () => {
    renderSidebar();

    expect(screen.getByText("Skill One")).toBeInTheDocument();
    expect(screen.getByText("精选")).toBeInTheDocument();
    expect(screen.getByText("仓库")).toBeInTheDocument();
    expect(screen.getByText("全部")).toBeInTheDocument();
    expect(screen.getByText("我的 skills")).toBeInTheDocument();
    expect(screen.getByText("设置")).toBeInTheDocument();
  });

  it("shows the registry total on 全部, repo total on 仓库, installed count on 全局", async () => {
    await boot(registryOf(400));
    harness.complete();
    await act(async () => {});
    renderSidebar();

    // Mock skills are installed (see ../lib/mock-local): 全部 shows the
    // registry total (400) and 仓库 the aggregated repo total; 精选/项目
    // have no count source and show none. The mock repos cycle
    // owner-${i%7}/repo-${i%11}, which resolves to the full 7×11 grid of
    // distinct repos over 400 skills (the pair repeats every 77 indexes).
    expect(await screen.findByText("400")).toBeInTheDocument();
    expect(await screen.findByText("77")).toBeInTheDocument();
    expect(await screen.findByText("6")).toBeInTheDocument();
    expect(screen.queryByText("12")).not.toBeInTheDocument();
  });

  it("keeps the 仓库 badge hidden while the registry is still streaming", async () => {
    await boot(registryOf(400));
    renderSidebar();
    await act(async () => {});

    // 全部 already reports its progressive count, but a repo count over a
    // partial index would be wrong, so 仓库 stays badge-less until ready.
    expect(await screen.findByText("400")).toBeInTheDocument();
    expect(screen.queryByText("77")).not.toBeInTheDocument();
  });

  it("omits badges for pages without a count source and hides badges before data loads", async () => {
    renderSidebar();

    // No registry data yet → no 400 badge (and no repo total either); the
    // installed skills render sync from the mock store, so 全局 still shows 6.
    expect(screen.queryByText("400")).not.toBeInTheDocument();
    expect(screen.queryByText("77")).not.toBeInTheDocument();
    expect(await screen.findByText("6")).toBeInTheDocument();
  });

  it("marks the active route link", () => {
    renderSidebar("/my-skills");

    const link = screen.getByRole("link", { name: /我的 skills/ });
    expect(link).toHaveAttribute("data-active", "true");
    expect(link).toHaveAttribute("aria-current", "page");
  });
});

describe("AppSidebar streaming", () => {
  it("shows the count from the first snapshot and grows it as more streams in", async () => {
    harness.init();
    renderSidebar();
    await act(async () => {});

    // The badge appears with the first batch instead of waiting for the whole
    // ~12MB file to land.
    harness.pushAll(registryOf(150));
    await act(async () => {});
    expect(await screen.findByText("150")).toBeInTheDocument();

    // A later snapshot grows it in place.
    harness.pushAll(registryOf(320).slice(150));
    await act(async () => {});
    expect(await screen.findByText("320")).toBeInTheDocument();
    expect(screen.queryByText("150")).not.toBeInTheDocument();
  });

  it("settles on the registry total once the stream completes", async () => {
    harness.init();
    renderSidebar();
    await act(async () => {});

    harness.pushAll(registryOf(150));
    await act(async () => {});
    expect(await screen.findByText("150")).toBeInTheDocument();

    harness.pushAll(registryOf(400).slice(150));
    harness.complete();
    await act(async () => {});
    expect(await screen.findByText("400")).toBeInTheDocument();
    expect(screen.queryByText("150")).not.toBeInTheDocument();
  });

  it("hides the count when the download fails part-way through", async () => {
    harness.init();
    renderSidebar();
    await act(async () => {});

    // Partial data has already reached the sidebar...
    harness.pushAll(registryOf(150));
    await act(async () => {});
    expect(await screen.findByText("150")).toBeInTheDocument();

    // ...then the stream dies. The controller resets the announced count to
    // zero (there is no trustworthy total to show), so the badge disappears
    // instead of staying frozen on 150 with nothing telling the user.
    harness.fail(new Error("network error"));
    await waitFor(() =>
      expect(screen.queryByText("150")).not.toBeInTheDocument(),
    );

    // The installed-skills badge is unaffected by the registry failure.
    expect(screen.getByText("6")).toBeInTheDocument();
  });

  it("reports the worker snapshot shape through the store", () => {
    const before: RegistrySnapshot = harness.getSnapshot();
    expect(before).toEqual({
      count: 0,
      complete: false,
      indexing: false,
      ready: false,
      epoch: 0,
      error: null,
      index: null,
    });
  });
});
