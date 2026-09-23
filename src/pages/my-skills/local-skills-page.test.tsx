import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, within, waitFor, configure } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LocalSkillsPage } from "./local-skills-page";
import { renderWithRouter } from "../../test/test-utils";
import { AppHeader } from "../../components/app-header";
import {
  resetMockAgentStatus,
  resetMockInstalledSkills,
  setMockSkillEnabled,
} from "../../lib/mock-local";
import { resetMockProvenance, seedMockProvenance } from "../../lib/provenance";
import { resetLinkSuggestions } from "../../lib/link-suggestions";

/** The page's back control and the debounce-free queries need a little room. */
configure({ asyncUtilTimeout: 5000 });

// The provenance hook consults the registry for namesake candidates; the mock
// answers "nothing found" by default so the worker-less test env stays silent.
const { searchSkills, lookupSkills, registrySnapshot } = vi.hoisted(() => ({
  searchSkills: vi.fn(),
  lookupSkills: vi.fn(),
  // One stable object: the hook reads it through useSyncExternalStore, which
  // treats a fresh snapshot on every call as an infinite render loop.
  registrySnapshot: { ready: true, epoch: 1 },
}));
vi.mock("../../lib/registry/client", () => ({
  searchSkills,
  lookupSkills,
  getRegistrySnapshot: () => registrySnapshot,
  subscribeRegistry: () => () => {},
}));

beforeEach(() => {
  searchSkills.mockResolvedValue({ hits: [] });
  lookupSkills.mockResolvedValue({ entries: [] });
  resetLinkSuggestions();
});

const NAMES = [
  "pdf",
  "docx",
  "pptx",
  "mcp-builder",
  "code-review",
  "frontend-design",
];

describe("LocalSkillsPage", () => {
  afterEach(() => {
    resetMockInstalledSkills();
    resetMockAgentStatus();
    resetMockProvenance();
    window.localStorage.clear();
  });

  it("lists the pool whole, with the source stated once in the head", async () => {
    renderWithRouter(<LocalSkillsPage />, { route: "/my-skills/local" });

    // Every install no source vouches for, uncapped — the page exists for the
    // rows the installed list's pool card folds behind its preview size.
    expect(
      await screen.findByRole("heading", { name: "本地安装" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("6 个 skill")).toBeInTheDocument();
    for (const name of NAMES) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(
      screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
    ).toHaveLength(6);
    // An enumeration, not a ranking: the first row's number carries no medal.
    expect(screen.getByText("1").className).not.toContain("text-amber-500");
  });

  it("leaves a placed install to the installed list", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills", slug: "pdf" } });
    renderWithRouter(<LocalSkillsPage />, { route: "/my-skills/local" });

    // pdf has a recorded source, so it belongs to its repository's card and not
    // to the pool: the pool holds the other five.
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
      ).toHaveLength(5),
    );
    expect(screen.queryByText("pdf")).not.toBeInTheDocument();
    expect(screen.getByText("5 个 skill")).toBeInTheDocument();
  });

  it("carries an enable switch, and the disabled state, on every row", async () => {
    setMockSkillEnabled("pdf", false);
    renderWithRouter(<LocalSkillsPage />, { route: "/my-skills/local" });

    // The same switch the installed list's rows carry, and the same dimming
    // that explains an off one.
    const off = await screen.findByRole("switch", { name: "开启 pdf" });
    expect(off.closest('[data-slot="card"]')).toHaveClass("opacity-60");
    expect(screen.getAllByRole("switch")).toHaveLength(6);
  });

  it("opens the same detail drawer the installed list uses", async () => {
    const user = userEvent.setup();
    renderWithRouter(<LocalSkillsPage />, { route: "/my-skills/local" });

    await user.click(
      await screen.findByRole("button", { name: "查看 pdf 详情" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("本地安装")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("switch", { name: "关闭 pdf" }),
    ).toBeInTheDocument();
  });

  it("offers the way back to the installed list from the header", async () => {
    // The way out is the header's now, so the header is what the page is
    // mounted under here.
    renderWithRouter(
      <>
        <AppHeader />
        <LocalSkillsPage />
      </>,
      { route: "/my-skills/local" },
    );

    expect(
      await screen.findByRole("link", { name: "返回我的 skills" }),
    ).toHaveAttribute("href", "/my-skills");
  });

  it("shows the empty state when every install has a source", async () => {
    seedMockProvenance(
      Object.fromEntries(
        NAMES.map((name) => [name, { repo: "acme/tools", slug: name }]),
      ),
    );
    renderWithRouter(<LocalSkillsPage />, { route: "/my-skills/local" });

    expect(await screen.findByText("没有本地安装的 skill")).toBeInTheDocument();
  });
});
