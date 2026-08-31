import { beforeEach, describe, it, expect, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";

import { fetchFullIndex, subscribeIndexProgress } from "../lib/skills-api";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider } from "./ui/sidebar";
import { renderWithRouter } from "../test/test-utils";
import type { Skill } from "../types/skill";

vi.mock("../lib/skills-api", () => ({
  // The hook passes this straight into its query key; keep it a stable array.
  SKILLS_QUERY_KEY: ["skills", 6],
  fetchFullIndex: vi.fn(),
  subscribeIndexProgress: vi.fn(),
}));

const mockFetchFullIndex = vi.mocked(fetchFullIndex);
const mockSubscribeIndexProgress = vi.mocked(subscribeIndexProgress);

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

beforeEach(() => {
  mockFetchFullIndex.mockReset();
  // Registry reports 400 skills, so the 全部 badge shows 400.
  mockFetchFullIndex.mockResolvedValue(registryOf(400));
  // By default no progress is reported: data arrives complete when
  // fetchFullIndex resolves, matching the pre-streaming behavior.
  mockSubscribeIndexProgress.mockReset();
  mockSubscribeIndexProgress.mockImplementation(() => () => {});
});

describe("AppSidebar", () => {
  it("renders brand and nav items", () => {
    renderSidebar();

    expect(screen.getByText("Skill One")).toBeInTheDocument();
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
    mockFetchFullIndex.mockImplementation(() => new Promise(() => {}));
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

describe("AppSidebar streaming", () => {
  /** The progress listener the sidebar's hook registered, or null. */
  let progress: ((skills: Skill[]) => void) | null;

  /** Emit a progress snapshot from the (mocked) streaming index. */
  async function emitProgress(skills: Skill[]) {
    await act(async () => {
      progress?.(skills);
    });
  }

  beforeEach(() => {
    progress = null;
    mockSubscribeIndexProgress.mockImplementation((listener) => {
      progress = listener;
      return () => {
        progress = null;
      };
    });
  });

  it("shows the count from the first snapshot and grows it as more streams in", async () => {
    // The download never finishes within the test — only snapshots arrive.
    mockFetchFullIndex.mockImplementation(() => new Promise<Skill[]>(() => {}));
    renderSidebar();
    await act(async () => {});

    // The badge appears with the first batch instead of waiting for the whole
    // ~12MB file to land.
    await emitProgress(registryOf(150));
    expect(await screen.findByText("150")).toBeInTheDocument();

    // A later snapshot grows it in place.
    await emitProgress(registryOf(320));
    expect(await screen.findByText("320")).toBeInTheDocument();
    expect(screen.queryByText("150")).not.toBeInTheDocument();
  });

  it("settles on the registry total once the stream completes", async () => {
    let resolveIndex: ((skills: Skill[]) => void) | undefined;
    mockFetchFullIndex.mockImplementation(
      () =>
        new Promise<Skill[]>((resolve) => {
          resolveIndex = resolve;
        }),
    );
    renderSidebar();
    await act(async () => {});

    await emitProgress(registryOf(150));
    expect(await screen.findByText("150")).toBeInTheDocument();

    await act(async () => {
      resolveIndex?.(registryOf(400));
    });
    expect(await screen.findByText("400")).toBeInTheDocument();
    expect(screen.queryByText("150")).not.toBeInTheDocument();
  });

  it("hides the count when the download fails part-way through", async () => {
    let rejectIndex: ((err: unknown) => void) | undefined;
    mockFetchFullIndex.mockImplementation(
      () =>
        new Promise<Skill[]>((_resolve, reject) => {
          rejectIndex = reject;
        }),
    );
    renderSidebar();
    await act(async () => {});

    // Partial data has already reached the sidebar...
    await emitProgress(registryOf(150));
    expect(await screen.findByText("150")).toBeInTheDocument();

    // ...then the stream dies. React Query keeps the last snapshot in `data`
    // after a rejection, so the badge must be hidden explicitly — otherwise
    // it would stay frozen on 150 with nothing telling the user it is wrong.
    await act(async () => {
      rejectIndex?.(new Error("network error"));
    });
    await waitFor(() =>
      expect(screen.queryByText("150")).not.toBeInTheDocument(),
    );

    // The installed-skills badge is unaffected by the registry failure.
    expect(screen.getByText("6")).toBeInTheDocument();
  });
});
