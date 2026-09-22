import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CategoryCard } from "./category-card";
import {
  fetchInstalledSkills,
  installSkillFromSource,
} from "../../lib/local-skills";
import { skillKey } from "../../lib/skill-view";
import type { SearchHit } from "../../lib/registry/protocol";
import { renderWithRouter } from "../../test/test-utils";

vi.mock("../../lib/local-skills", () => ({
  fetchInstalledSkills: vi.fn(),
  installSkillFromSource: vi.fn(),
}));

/** The classification the card stands for, and its display label + glyph. */
const DOMAIN = "office-productivity";

/** One of the category's skills, as the grouping hands it over: the skills
 *  come from several repositories, so a row's owner avatar has to differ. */
function hit(name: string, repo: string, extras = {}): SearchHit {
  return {
    skill: {
      name,
      repo,
      description: `${name} does something useful.`,
      stars: 1_000,
      downloads: 1_000,
      path: `skills/${name}`,
      ...extras,
    },
    matched: {},
  };
}

/** Eight skills across four repositories, most installed first — one more than
 *  the card's cap, so the tail has something to account for. */
const skills: SearchHit[] = [
  hit("pdf", "anthropics/skills"),
  hit("docx", "anthropics/skills"),
  hit("pptx", "acme/decks"),
  hit("xlsx", "acme/sheets"),
  hit("slides", "acme/decks"),
  hit("canvas", "beta/labs"),
  hit("figma", "beta/labs"),
  hit("notion", "gamma/notes"),
];

/** The card as a list item, the way the explore list mounts it. */
function renderCard(overrides: Parameters<typeof CategoryCard>[0] | object = {}) {
  return renderWithRouter(
    <ul>
      <CategoryCard
        domain={DOMAIN}
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

describe("CategoryCard", () => {
  beforeEach(() => {
    vi.mocked(fetchInstalledSkills).mockResolvedValue([]);
  });

  it("leads with the skills and signs off with the category's own bar", () => {
    const { container } = renderCard();

    // The skills are the card's content: no header stands between the reader
    // and the things they are comparing.
    expect(container.querySelector('[data-slot="card-header"]')).toBeNull();
    expect(container.querySelector('[data-slot="card-content"]')).not.toBeNull();

    // The one bar carries what the category is and the way into its page: the
    // category's emoji in the avatar slot, its label, and the door.
    const bar = screen.getByRole("link", {
      name: `查看分类 办公效率，${skills.length} 个 skill`,
    });
    expect(bar).toHaveAttribute("href", `/explore/category/${DOMAIN}`);
    expect(within(bar).getByText("办公效率")).toBeInTheDocument();
    expect(within(bar).getByText("🗂️")).toBeInTheDocument();
    // The bar is the card's one control.
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("leads each row with the skill's owner avatar, not a classification glyph", () => {
    renderCard();

    const pdf = screen.getByRole("button", { name: "查看 pdf 详情" });
    // The row's leading slot is the owner's face — the one fact the card, which
    // *is* the classification, cannot itself carry.
    expect(pdf.querySelector('[data-slot="avatar"]')).not.toBeNull();
    // The domain emoji belongs to the bar, never to a row.
    expect(within(pdf).queryByText("🗂️")).toBeNull();
    expect(pdf).toHaveTextContent("pdf does something useful.");
  });

  it("caps the list at seven rows and states the category's total", () => {
    renderCard();

    // Past the cap a skill is not rendered as a row...
    expect(screen.queryByText("notion")).not.toBeInTheDocument();
    expect(rowNames()).toEqual([
      "pdf",
      "docx",
      "pptx",
      "xlsx",
      "slides",
      "canvas",
      "figma",
    ]);
    // ...and the bar's figure is the category's total, not the seven on screen:
    // that is what makes a capped list read as "these of them", the same way
    // the repository card's bar does.
    expect(
      within(
        screen.getByRole("link", {
          name: `查看分类 办公效率，8 个 skill`,
        }),
      ).getByText("8 个 skill"),
    ).toBeInTheDocument();
  });

  it("lists every match while a search is live, uncapped", () => {
    renderCard({ hasQuery: true });

    // The cap protects a browse from one huge category; under a search it would
    // hide hits the reader asked for, so it stands down.
    expect(rowNames()).toEqual([
      "pdf",
      "docx",
      "pptx",
      "xlsx",
      "slides",
      "canvas",
      "figma",
      "notion",
    ]);
  });

  it("opens one skill from its row and marks the row the panel shows", () => {
    const onOpenSkill = vi.fn();
    renderCard({ onOpenSkill, selected: skillKey(skills[1].skill) });

    fireEvent.click(screen.getByRole("button", { name: "查看 docx 详情" }));

    expect(onOpenSkill).toHaveBeenCalledWith(skillKey(skills[1].skill));
    expect(
      screen.getByRole("button", { name: "查看 docx 详情" }),
    ).toHaveAttribute("aria-current", "true");
  });

  it("puts the install button beside the row, never inside it", async () => {
    const user = userEvent.setup();
    const onOpenSkill = vi.fn();
    vi.mocked(installSkillFromSource).mockResolvedValue(undefined);
    renderCard({ onOpenSkill });

    const row = screen.getByRole("button", { name: "查看 pdf 详情" });
    expect(within(row).queryAllByRole("button")).toHaveLength(0);
    expect(row.parentElement?.querySelectorAll("button")).toHaveLength(2);

    await user.click(screen.getAllByRole("button", { name: "安装" })[0]);

    expect(installSkillFromSource).toHaveBeenCalledWith(
      "anthropics/skills",
      "pdf",
      { rev: undefined },
    );
    expect(onOpenSkill).not.toHaveBeenCalled();
  });

  it("keeps the install button out of the way until the row is pointed at", () => {
    renderCard();

    const install = screen.getAllByRole("button", { name: "安装" })[0];
    const reveal = install.parentElement as HTMLElement;
    expect(reveal).toHaveClass("opacity-0");
    expect(reveal).toHaveClass("group-hover/row:opacity-100");
    // An installed badge is a state rather than an invitation, so the wrapper
    // also reveals from the button's own `data-state`.
    expect(reveal).toHaveClass("has-data-[state=installed]:opacity-100");
  });

  it("keeps an installed skill's badge on screen without a hover", async () => {
    const user = userEvent.setup();
    vi.mocked(installSkillFromSource).mockResolvedValue(undefined);
    renderCard();

    await user.click(screen.getAllByRole("button", { name: "安装" })[0]);

    const installed = await screen.findByRole("button", { name: "已安装" });
    expect(installed).toHaveAttribute("data-state", "installed");
    const reveal = installed.parentElement as HTMLElement;
    expect(reveal).toHaveClass("has-data-[state=installed]:opacity-100");
  });
});
