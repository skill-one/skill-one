import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  screen,
  waitFor,
  configure,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";

import { SearchPage } from "./search-page";
import { AppHeader } from "../../components/app-header";
import { renderWithRouter } from "../../test/test-utils";
import {
  installMockSkill,
  resetMockAgentStatus,
  resetMockInstalledSkills,
} from "../../lib/mock-local";

configure({ asyncUtilTimeout: 5000 });

// The store section reads the registry's grouped search and the live section
// asks skills.sh; both answer empty here so the tests see the page's own
// behavior — section wiring, the URL question, the prompt — rather than data.
const { searchSkills, getGroups, registrySnapshot } = vi.hoisted(() => ({
  searchSkills: vi.fn(),
  getGroups: vi.fn(),
  // One stable object: the page reads it through useSyncExternalStore, which
  // treats a fresh snapshot on every call as an infinite render loop.
  registrySnapshot: { ready: true, epoch: 1 },
}));
vi.mock("../../lib/registry/client", () => ({
  searchSkills,
  lookupSkills: vi.fn().mockResolvedValue({ entries: [] }),
  getGroups,
  getRegistrySnapshot: () => registrySnapshot,
  subscribeRegistry: () => () => {},
}));
vi.mock("../../lib/skills-sh", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/skills-sh")>()),
  searchSkillsSh: vi.fn().mockResolvedValue([]),
}));

beforeEach(() => {
  searchSkills.mockResolvedValue({ hits: [] });
  getGroups.mockResolvedValue({ groups: [], total: 0 });
  // The in-memory answer the installed section reads: one skill, so "what this
  // machine has" has something in it to find.
  resetMockInstalledSkills();
  installMockSkill("pdf");
});

/**
 * The store's grouped answer to a search for `name`: one repository carrying
 * one skill of that name under a recorded source — a namesake of what the
 * machine has installed, which is what an installed search's store section is
 * for.
 */
function storeAnswerFor(name: string) {
  return {
    groups: [
      {
        key: "acme/skills",
        title: "acme/skills",
        stars: 12,
        skills: [
          {
            skill: {
              id: `acme/skills/${name}`,
              name,
              repo: "acme/skills",
              description: "PDF 文档读取、生成、合并、拆分与标注。",
              stars: 12,
              downloads: 30,
            },
            matched: { name: [name] },
          },
        ],
      },
    ],
    total: 1,
  };
}

/**
 * The page as the app mounts it: the header above it (the field writes the
 * URL's question) and the search route below. The question arrives as `?q=`,
 * the way the header, a shared link, or the popover deep link puts it there.
 */
function renderSearchPage(route = "/search?q=pdf") {
  return renderWithRouter(
    <>
      <AppHeader />
      <Routes>
        <Route path="/search" element={<SearchPage />} />
      </Routes>
    </>,
    { route },
  );
}

describe("SearchPage", () => {
  afterEach(() => {
    resetMockInstalledSkills();
    resetMockAgentStatus();
    window.localStorage.clear();
  });

  it("holds a prompt instead of an answer without a question", async () => {
    renderSearchPage("/search");

    expect(await screen.findByText("搜索 Skill...")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /查看 .+ 详情/ }),
    ).not.toBeInTheDocument();
  });

  it("answers the URL's question with what this machine has", async () => {
    renderSearchPage("/search?q=pdf");

    // The question mirrors into the header's field, and the installed section
    // answers it from memory.
    expect(await screen.findByLabelText("搜索 Skill")).toHaveValue("pdf");
    const installed = await screen.findByRole("region", {
      name: "本地已安装",
    });
    expect(installed).toHaveTextContent("pdf");
  });

  it("reads the answer in its own unit, leaving the browse lists alone", async () => {
    const user = userEvent.setup();
    renderSearchPage("/search?q=pdf");
    await screen.findByRole("region", { name: "本地已安装" });

    // Repository cards by default...
    expect(
      await screen.findByRole("button", { name: "查看 pdf 详情" }),
    ).toBeInTheDocument();

    // ...skill rows on the page's own switch, which belongs to no browse list.
    await user.click(screen.getByRole("button", { name: "列表" }));
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /查看 .+ 详情/ }),
      ).toHaveLength(1),
    );
    expect(
      screen.getByRole("button", { name: "查看 pdf 详情" }),
    ).toBeInTheDocument();
  });

  it("empties the answer when the field is cleared", async () => {
    const user = userEvent.setup();
    renderSearchPage("/search?q=pdf");
    await screen.findByRole("region", { name: "本地已安装" });

    await user.clear(screen.getByLabelText("搜索 Skill"));

    expect(await screen.findByText("搜索 Skill...")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "本地已安装" }),
    ).not.toBeInTheDocument();
  });

  it("leads with the registry's answer and titles this machine's installs beside it", async () => {
    const user = userEvent.setup();
    // The registry's index answers the same question with a namesake of an
    // installed skill — the same name under a recorded source, which is what
    // the store's row below the install is for.
    getGroups.mockResolvedValue(storeAnswerFor("pdf"));
    renderSearchPage("/search?q=pdf");
    await screen.findByRole("region", { name: "本地已安装" });

    // The registry leads, laid out plainly: it is the biggest collection and the
    // one already in memory, so its answer needs no header of its own.
    expect(
      screen.queryByRole("region", { name: "应用商店" }),
    ).not.toBeInTheDocument();

    // Two answers, two rows of the same name — the store entry above, the
    // install in its own titled section below.
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "查看 pdf 详情" }),
      ).toHaveLength(2),
    );
    // The store row wears the store's surface: the install CTA the installed
    // surface never offers.
    await user.click(screen.getAllByRole("button", { name: "查看 pdf 详情" })[0]);
    expect(
      await within(await screen.findByRole("dialog")).findByRole("button", {
        name: "已安装",
      }),
    ).toBeInTheDocument();
  });
});
