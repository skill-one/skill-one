import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SkillListRow } from "./skill-list-row";
import {
  fetchInstalledSkills,
  installSkillFromSource,
} from "../../lib/local-skills";
import { renderWithRouter } from "../../test/test-utils";
import type { Skill } from "../../types/skill";

vi.mock("../../lib/local-skills", () => ({
  fetchInstalledSkills: vi.fn(),
  installSkillFromSource: vi.fn(),
}));

const skill: Skill = {
  name: "pdf",
  repo: "anthropics/skills",
  description: "Read and merge PDF documents.",
  stars: 169600,
  downloads: 2991984,
};

// √((2991984 + 1) × (169600 + 1)) − 1 = 712350, rendered compactly.
const BLENDED = "712.4K";

describe("SkillListRow", () => {
  beforeEach(() => {
    // No skills are installed unless a test says otherwise.
    vi.mocked(fetchInstalledSkills).mockResolvedValue([]);
  });

  it("renders as a list item with name, repo, description and popularity", () => {
    const { container } = renderWithRouter(<SkillListRow skill={skill} />);

    expect(container.querySelector("li")).not.toBeNull();
    expect(screen.getByText("pdf")).toBeInTheDocument();
    // The repo is named by the author chip, not written out on the card.
    expect(
      screen.getByRole("button", { name: "仓库 anthropics/skills" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Read and merge PDF documents."),
    ).toBeInTheDocument();
    // One blended figure inline; neither source count leaks into the row.
    expect(screen.getByText(BLENDED)).toBeInTheDocument();
    expect(screen.queryByText("3M")).not.toBeInTheDocument();
    expect(screen.queryByText("169.6K")).not.toBeInTheDocument();
  });

  it("leads with the skill's own image and pins the author chip under the name", () => {
    const { container } = renderWithRouter(<SkillListRow skill={skill} />);

    // The skill's image is the card's leading element, named for assistive
    // tech; nothing loads here, so it shows the author's initial.
    const cover = container.querySelector('[data-slot="skill-cover"]');
    expect(cover).toHaveAttribute("aria-label", "pdf 封面图");

    // The chip rides the source line under the name and names the repository
    // it stands for, with the source written out beside it.
    const chip = screen.getByRole("button", {
      name: "仓库 anthropics/skills",
    });
    expect(chip.querySelector('[data-slot="avatar"]')).not.toBeNull();
    expect(chip.closest('[data-slot="card-description"]')).not.toBeNull();
  });

  it("lets the header shrink so a long name cannot push the action out of the card", () => {
    const { container } = renderWithRouter(
      <SkillListRow skill={{ ...skill, name: "improve-codebase-architecture" }} />,
    );

    // jsdom lays nothing out, so what is pinned here is the guard itself: the
    // header is a grid whose `1fr` track keeps a content-based minimum, and
    // without `min-w-0` on the leading block a name that does not fit widens
    // that track past the card and carries the corner action out of the
    // border with it.
    const header = container.querySelector('[data-slot="card-header"]');
    expect(header?.firstElementChild).toHaveClass("min-w-0");
    expect(container.querySelector('[data-slot="card-action"]')).not.toBeNull();
  });

  it("labels a skill with no source instead of naming a repo", () => {
    renderWithRouter(<SkillListRow skill={{ ...skill, repo: "" }} />);

    // No source, so no chip to hover: the label is what stands in for the
    // repository the card cannot name.
    expect(screen.getByText("本地安装")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^仓库 / }),
    ).not.toBeInTheDocument();
  });

  it("names the repository from the author chip's hover card", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SkillListRow skill={skill} />);

    await user.hover(
      screen.getByRole("button", { name: "仓库 anthropics/skills" }),
    );
    // The card only mounts once the rail's chip is hovered; the repo's name is
    // its one link out — the whole row opens GitHub, no second line saying so.
    const openLink = await screen.findByRole("link", {
      name: "在 GitHub 中打开 anthropics/skills",
    });

    // The avatar's own words: which repo it is, how big it is, and the one
    // action that belongs to a repository — carried by the name itself.
    const card = openLink.parentElement!;
    expect(openLink).toHaveTextContent("anthropics/skills");
    expect(card).toHaveTextContent("169.6K Star");
    expect(openLink).toHaveAttribute(
      "href",
      "https://github.com/anthropics/skills",
    );
    // Nothing states the action in words any more: the external mark beside
    // the name is what says the click leaves the app.
    expect(card).not.toHaveTextContent("在 GitHub 中打开");
  });

  it("breaks the figure down into installs and stars on hover", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SkillListRow skill={skill} />);

    await user.hover(screen.getByRole("button", { name: /^热度 / }));
    const tip = await screen.findByRole("tooltip");

    // Minimal one-line form: the blend already sits on the trigger, so the
    // tooltip is just icon + count for the two source figures, no labels
    // and no formula line.
    expect(within(tip).getByText("3M")).toBeInTheDocument();
    expect(within(tip).getByText("169.6K")).toBeInTheDocument();
    expect(tip.textContent).toMatch(/3M\s*·\s*169\.6K/);
    expect(within(tip).queryByText("热度")).not.toBeInTheDocument();
    expect(within(tip).queryByText("安装")).not.toBeInTheDocument();
    expect(tip.textContent).not.toContain("√");
  });

  it("labels the figure with its breakdown for assistive tech", () => {
    renderWithRouter(<SkillListRow skill={skill} />);

    expect(
      screen.getByRole("button", {
        name: "热度 712.4K：安装 3M · Star 169.6K",
      }),
    ).toBeInTheDocument();
  });

  it("takes the card's controls in card order: chip, install, then figure", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SkillListRow skill={skill} />);

    // The tab order follows the card top to bottom: the source line under the
    // name, then the corner action, then the rail's figure.
    await user.tab();
    expect(
      screen.getByRole("button", { name: "仓库 anthropics/skills" }),
    ).toHaveFocus();

    await user.tab();
    expect(
      screen.getByRole("button", { name: "安装" }),
    ).toHaveFocus();

    await user.tab();
    expect(
      screen.getByRole("button", {
        name: "热度 712.4K：安装 3M · Star 169.6K",
      }),
    ).toHaveFocus();
  });

  it("reaches the same breakdown from the keyboard", async () => {
    renderWithRouter(<SkillListRow skill={skill} />);

    // The figure is a control of its own — the card body opens the panel — and
    // its tooltip carries no delay, so focusing it opens the same breakdown the
    // pointer gets on hover.
    screen
      .getByRole("button", { name: "热度 712.4K：安装 3M · Star 169.6K" })
      .focus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("169.6K");
  });

  it("lets a missing count pull the blend down instead of hiding it", () => {
    renderWithRouter(<SkillListRow skill={{ ...skill, downloads: 0 }} />);

    // √(1 × 169601) − 1 = 411: an equal weighting has to show the absent side,
    // rather than quietly falling back to the star count.
    expect(screen.getByText("411")).toBeInTheDocument();
    expect(screen.queryByText("169.6K")).not.toBeInTheDocument();
  });

  it("renders 0 when neither count exists", () => {
    renderWithRouter(
      <SkillListRow skill={{ ...skill, downloads: 0, stars: 0 }} />,
    );

    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("keeps a missing description readable", () => {
    renderWithRouter(<SkillListRow skill={{ ...skill, description: "" }} />);

    // A row is one fixed-height line, so an empty description falls back to a
    // placeholder instead of collapsing the row's second line.
    expect(screen.getByText("暂无描述")).toBeInTheDocument();
  });

  it("shows the idle install button without hover, quietly", () => {
    const { container } = renderWithRouter(<SkillListRow skill={skill} />);

    // Idle is the resting state of every row in a grid, so the download stays
    // visible but wears the muted secondary chrome — there to be found, not
    // competing with the name. No state waits for hover any more, so the
    // reveal classes are gone from the corner slot entirely.
    const action = container.querySelector('[data-slot="card-action"]');
    expect(action).not.toHaveClass("opacity-0", "pointer-events-none");
    const button = within(action as HTMLElement).getByRole("button", {
      name: "安装",
    });
    expect(button).toHaveClass("bg-secondary");
  });

  it("keeps the installed state visible without hover", async () => {
    const user = userEvent.setup();
    vi.mocked(installSkillFromSource).mockResolvedValue(undefined);
    const { container } = renderWithRouter(<SkillListRow skill={skill} />);

    await user.click(screen.getByRole("button", { name: "安装" }));

    // Installed is a fact, not an action: it drops the reveal and stays, and
    // it reads as a success badge — a tinted emerald surface, not the muted
    // secondary chrome the other disabled states wear.
    const installed = await screen.findByRole("button", { name: "已安装" });
    expect(
      container.querySelector('[data-slot="card-action"]'),
    ).not.toHaveClass("opacity-0");
    expect(installed).toHaveClass("bg-emerald-600/10", "text-emerald-600");
  });

  it("keeps a failed install's retry visible without hover", async () => {
    const user = userEvent.setup();
    vi.mocked(installSkillFromSource).mockRejectedValue(new Error("no"));
    const { container } = renderWithRouter(<SkillListRow skill={skill} />);

    await user.click(screen.getByRole("button", { name: "安装" }));

    // The failure needs attention, so the retry does not wait for hover.
    await screen.findByRole("alert");
    expect(
      container.querySelector('[data-slot="card-action"]'),
    ).not.toHaveClass("opacity-0");
  });

  it("opens the detail panel when the row is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithRouter(<SkillListRow skill={skill} onSelect={onSelect} />);

    await user.click(screen.getByText("pdf"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("supports keyboard activation via Enter", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithRouter(<SkillListRow skill={skill} onSelect={onSelect} />);

    screen.getByRole("button", { name: "查看 pdf 详情" }).focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("does not open the detail panel when clicking install", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    vi.mocked(installSkillFromSource).mockResolvedValue(undefined);
    renderWithRouter(<SkillListRow skill={skill} onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: "安装" }));
    expect(installSkillFromSource).toHaveBeenCalledWith(skill.repo, skill.name, {
      rev: skill.rev,
    });
    expect(onSelect).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("button", { name: "已安装" }),
    ).toBeDisabled();
  });

  it("reports a failed install under the row", async () => {
    const user = userEvent.setup();
    vi.mocked(installSkillFromSource).mockRejectedValue(
      new Error("clone failed: network unreachable"),
    );
    renderWithRouter(<SkillListRow skill={skill} />);

    await user.click(screen.getByRole("button", { name: "安装" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "clone failed: network unreachable",
    );
  });

  it("highlights the selected row", () => {
    renderWithRouter(
      <SkillListRow skill={skill} selected onSelect={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "查看 pdf 详情" })).toHaveClass(
      "ring-primary",
    );
  });

  it("wraps matched search tokens in <mark>", () => {
    renderWithRouter(
      <SkillListRow skill={skill} matched={{ name: ["pdf"] }} />,
    );

    // Whole tokens only, case-insensitive against the index, with the original
    // casing kept.
    expect(screen.getByText("pdf").tagName).toBe("MARK");
  });

  it("splits a matched name across marks without losing the name", () => {
    const { container } = renderWithRouter(
      <SkillListRow
        skill={{ ...skill, name: "pdf-tools" }}
        matched={{ name: ["pdf"] }}
      />,
    );

    expect(screen.getByText("pdf").tagName).toBe("MARK");
    // The heading remains one logical string across the highlight segments.
    expect(container.querySelector("h3")).toHaveTextContent("pdf-tools");
  });

  it("marks a CJK bigram inside an unsegmented run", () => {
    const { container } = renderWithRouter(
      <SkillListRow
        skill={{ ...skill, name: "PDF文档读取" }}
        matched={{ name: ["文档"] }}
      />,
    );

    // The index stores Han text as bigrams, shorter than the run they came
    // from, so this is what whole-token comparison could not mark.
    expect(container.querySelector("mark")).toHaveTextContent("文档");
  });

  it("marks a term inside a longer word", () => {
    const { container } = renderWithRouter(
      <SkillListRow
        skill={{ ...skill, name: "PDFs-splitter" }}
        matched={{ name: ["pdf"] }}
      />,
    );

    // Terms are whole indexed tokens, but a token that a longer word also
    // contains is marked too — the one thing the term split does differently
    // from comparing whole segments.
    expect(container.querySelector("mark")).toHaveTextContent("PDF");
  });

  it("renders no marks outside a search", () => {
    const { container } = renderWithRouter(<SkillListRow skill={skill} />);

    expect(container.querySelector("mark")).toBeNull();
  });

  it("renders no detail affordance without an onSelect handler", () => {
    const { container } = renderWithRouter(<SkillListRow skill={skill} />);

    expect(container.querySelector('[role="button"]')).toBeNull();
    expect(screen.queryByText("查看 pdf 详情")).not.toBeInTheDocument();
  });

  it("shows the profile domain as a badge when the skill has one", () => {
    renderWithRouter(
      <SkillListRow
        skill={{ ...skill, profile: { domain: ["content-creation"] } }}
      />,
    );

    expect(screen.getByText("内容创作")).toBeInTheDocument();
  });

  it("shows no domain badge for an unclassified skill", () => {
    renderWithRouter(<SkillListRow skill={skill} />);

    expect(screen.queryByText("内容创作")).not.toBeInTheDocument();
  });
});
