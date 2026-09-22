import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RepoCard } from "./repo-card";
import {
  fetchInstalledSkills,
  installSkillFromSource,
} from "../../lib/local-skills";
import { skillKey } from "../../lib/skill-view";
import { formatCount } from "../../lib/utils";
import type { SearchHit } from "../../lib/registry/protocol";
import type { Skill } from "../../types/skill";
import { renderWithRouter } from "../../test/test-utils";

vi.mock("../../lib/local-skills", () => ({
  fetchInstalledSkills: vi.fn(),
  installSkillFromSource: vi.fn(),
}));

vi.mock("../../lib/open-external", () => ({ openExternal: vi.fn() }));

const REPO = "anthropics/skills";
const STARS = 169_600;

/** One of the repository's skills, as the grouping hands it over: the skill
 *  plus the search terms to highlight (none outside a search). */
function hit(name: string, extras: Partial<Skill> = {}): SearchHit {
  return {
    skill: {
      name,
      repo: REPO,
      description: `${name} does something useful.`,
      stars: STARS,
      downloads: 1_000,
      path: `skills/${name}`,
      ...extras,
    },
    matched: {},
  };
}

/** Six skills, most installed first — one more than the card's cap, so the
 *  tail has something to account for. */
const skills: SearchHit[] = [
  hit("pdf", { downloads: 3_000, profile: { domain: ["office-productivity"] } }),
  hit("docx", { downloads: 2_000 }),
  hit("pptx", { downloads: 1_000 }),
  hit("xlsx", { downloads: 500 }),
  hit("slides", { downloads: 100 }),
  hit("canvas", { downloads: 10 }),
];

/** The card as a list item, the way every surface mounts it. */
function renderCard(overrides: Parameters<typeof RepoCard>[0] | object = {}) {
  return renderWithRouter(
    <ul>
      <RepoCard
        repo={REPO}
        stars={STARS}
        skills={skills}
        onOpenSkill={() => {}}
        {...overrides}
      />
    </ul>,
  );
}

/** The card's rows, in DOM order, named by the label each one carries. */
const rowNames = () =>
  screen
    .getAllByRole("button", { name: /^查看 .+ 详情$/ })
    .map((row) => row.getAttribute("aria-label")?.replace(/^查看 | 详情$/g, ""));

describe("RepoCard", () => {
  beforeEach(() => {
    vi.mocked(fetchInstalledSkills).mockResolvedValue([]);
  });

  it("leads with the repository, its figures and a link to its page", () => {
    renderCard();

    const head = screen.getByRole("link", {
      name: `打开仓库 ${REPO}，6 个 skill`,
    });
    expect(head).toHaveAttribute("href", `/repo/${REPO}`);
    expect(head).toHaveTextContent(REPO);
    // The two figures a repository group's header used to carry, compactly.
    expect(head).toHaveTextContent(formatCount(STARS));
    expect(head).toHaveTextContent("6 个");
  });

  it("lists the repository's skills in order, under a glyph and a description", () => {
    renderCard();

    expect(rowNames()).toEqual(["pdf", "docx", "pptx", "xlsx"]);
    const pdf = screen.getByRole("button", { name: "查看 pdf 详情" });
    // The classification rides the row as its glyph, and the description
    // follows the name on the same line.
    expect(within(pdf).getByText("🗂️")).toBeInTheDocument();
    expect(pdf).toHaveTextContent("pdf does something useful.");
  });

  it("caps the list and hands the rest to the repository's page", () => {
    renderCard();

    // Past the cap a skill is not rendered as a row...
    expect(screen.queryByText("slides")).not.toBeInTheDocument();
    expect(screen.queryByText("canvas")).not.toBeInTheDocument();
    // ...the tail accounts for it, and the tail's own link is the same door as
    // the head's.
    expect(screen.getByText("还有 2 个 skill")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: `查看仓库 ${REPO} 的全部 6 个 skill`,
      }),
    ).toHaveAttribute("href", `/repo/${REPO}`);
  });

  it("renders a one-skill repository with the same body and no tail", () => {
    renderCard({ skills: [skills[0]] });

    expect(rowNames()).toEqual(["pdf"]);
    expect(screen.queryByText(/^还有 /)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: `打开仓库 ${REPO}，1 个 skill` }),
    ).toBeInTheDocument();
  });

  it("lists every match while a search is live, uncapped", () => {
    renderCard({ hasQuery: true });

    // The cap protects a browse from one big repository; under a search it
    // would hide hits the reader asked for, so it stands down.
    expect(rowNames()).toEqual([
      "pdf",
      "docx",
      "pptx",
      "xlsx",
      "slides",
      "canvas",
    ]);
    expect(screen.queryByText(/^还有 /)).not.toBeInTheDocument();
  });

  it("opens one skill from its row and marks the row the panel shows", () => {
    const onOpenSkill = vi.fn();
    renderCard({ onOpenSkill, selected: skillKey(skills[1].skill) });

    fireEvent.click(screen.getByRole("button", { name: "查看 docx 详情" }));

    expect(onOpenSkill).toHaveBeenCalledWith(skillKey(skills[1].skill));
    expect(screen.getByRole("button", { name: "查看 docx 详情" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "查看 pdf 详情" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("puts the install button beside the row, never inside it", async () => {
    const user = userEvent.setup();
    const onOpenSkill = vi.fn();
    vi.mocked(installSkillFromSource).mockResolvedValue(undefined);
    renderCard({ onOpenSkill });

    // Two sibling controls: the row opens the skill, the button installs it.
    // A button inside a button is invalid, and a click must never mean both.
    const row = screen.getByRole("button", { name: "查看 pdf 详情" });
    expect(within(row).queryAllByRole("button")).toHaveLength(0);
    expect(row.parentElement?.querySelectorAll("button")).toHaveLength(2);

    await user.click(screen.getAllByRole("button", { name: "安装" })[0]);

    expect(installSkillFromSource).toHaveBeenCalledWith(REPO, "pdf", {
      rev: undefined,
    });
    expect(onOpenSkill).not.toHaveBeenCalled();
  });

  it("leaves the app for the repository's own page on GitHub", async () => {
    const user = userEvent.setup();
    const { openExternal } = await import("../../lib/open-external");
    renderCard();

    await user.click(
      screen.getByRole("button", { name: `在 GitHub 打开 ${REPO}` }),
    );

    expect(openExternal).toHaveBeenCalledWith(`https://github.com/${REPO}`);
  });
});
