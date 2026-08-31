import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SkillCard } from "./skill-card";
import {
  fetchInstalledSkills,
  installSkillFromSource,
} from "../../lib/local-skills";
import type { InstalledSkill } from "../../lib/skills-manager";
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

const installedSkill: InstalledSkill = {
  name: "pdf",
  path: "~/.agents/skills/pdf",
  scope: "global",
  agents: [],
  source: "anthropics/skills",
  sourceUrl: null,
  sourceType: "github",
  enabled: true,
};

describe("SkillCard", () => {
  beforeEach(() => {
    // No skills are installed unless a test says otherwise.
    vi.mocked(fetchInstalledSkills).mockResolvedValue([]);
  });

  it("renders name, repo, description and downloads, but no stars", () => {
    renderWithRouter(<SkillCard skill={skill} />);

    expect(screen.getByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("anthropics/skills")).toBeInTheDocument();
    expect(
      screen.getByText("Read and merge PDF documents."),
    ).toBeInTheDocument();
    // Downloads render; the star count is intentionally not shown on cards.
    expect(screen.getByText("3M")).toBeInTheDocument();
    expect(screen.queryByText("169.6K")).not.toBeInTheDocument();
  });

  it("renders downloads of 0 when the metric is missing", () => {
    renderWithRouter(<SkillCard skill={{ ...skill, downloads: 0 }} />);

    // The downloads stat renders as "0" instead of being hidden.
    expect(screen.getByText("0")).toBeInTheDocument();
    // Stars never render, not even when the underlying data is present.
    expect(screen.queryByText("169.6K")).not.toBeInTheDocument();
  });

  it("renders with an empty description placeholder", () => {
    renderWithRouter(<SkillCard skill={{ ...skill, description: "" }} />);

    expect(screen.getByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("anthropics/skills")).toBeInTheDocument();
    expect(screen.getByText("3M")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "安装" })).toBeEnabled();
  });

  it("shows an icon-only install button with an accessible label", () => {
    renderWithRouter(<SkillCard skill={skill} />);
    const button = screen.getByRole("button", { name: "安装" });
    expect(button).toBeEnabled();
    // Icon-only: a Download icon plus a visually hidden label, no visible text.
    expect(button.querySelector("svg")).toBeInTheDocument();
    expect(screen.getByText("安装")).toHaveClass("sr-only");
  });

  it("reveals an '安装' tooltip when hovering the icon-only button", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SkillCard skill={skill} />);

    await user.hover(screen.getByRole("button", { name: "安装" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("安装");
  });

  it("renders the installed state for skills already present on disk", async () => {
    vi.mocked(fetchInstalledSkills).mockResolvedValue([installedSkill]);
    renderWithRouter(<SkillCard skill={skill} />);

    const button = await screen.findByRole("button", { name: "已安装" });
    expect(button).toBeDisabled();
  });

  it("keeps the install button when only the name matches but the source differs", async () => {
    vi.mocked(fetchInstalledSkills).mockResolvedValue([
      { ...installedSkill, source: "other-owner/other-repo" },
    ]);
    renderWithRouter(<SkillCard skill={skill} />);

    // The installed list resolves without flipping this card's button.
    expect(await screen.findByRole("button", { name: "安装" })).toBeEnabled();
  });

  it("installs the skill and switches to a disabled 'installed' state", async () => {
    const user = userEvent.setup();
    vi.mocked(installSkillFromSource).mockResolvedValue(undefined);
    renderWithRouter(<SkillCard skill={skill} />);

    await user.click(screen.getByRole("button", { name: "安装" }));
    expect(installSkillFromSource).toHaveBeenCalledWith(skill.repo, skill.name);
    expect(
      await screen.findByRole("button", { name: "已安装" }),
    ).toBeDisabled();
    // Every state stays icon-only; the label remains visually hidden.
    expect(screen.getByText("已安装")).toHaveClass("sr-only");
  });

  it("returns to '重试' and surfaces the error when the install fails", async () => {
    const user = userEvent.setup();
    vi.mocked(installSkillFromSource).mockRejectedValue(
      new Error("clone failed: network unreachable"),
    );
    renderWithRouter(<SkillCard skill={skill} />);

    await user.click(screen.getByRole("button", { name: "安装" }));
    expect(await screen.findByRole("button", { name: "重试" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "clone failed: network unreachable",
    );
  });

  it("opens the detail sheet when the card is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithRouter(<SkillCard skill={skill} onSelect={onSelect} />);

    await user.click(screen.getByText("pdf"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("supports keyboard activation via Enter", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithRouter(<SkillCard skill={skill} onSelect={onSelect} />);

    screen.getByRole("button", { name: "查看 pdf 详情" }).focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("does not open the detail sheet when clicking install", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithRouter(<SkillCard skill={skill} onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: "安装" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("highlights the selected card", () => {
    renderWithRouter(<SkillCard skill={skill} selected onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "查看 pdf 详情" })).toHaveClass(
      "ring-primary",
    );
  });

  it("wraps matched name tokens in <mark> and keeps the name intact", () => {
    const { container } = renderWithRouter(
      <SkillCard
        skill={{ ...skill, name: "pdf-tools" }}
        matched={{ name: ["pdf"] }}
      />,
    );

    const mark = screen.getByText("pdf");
    expect(mark.tagName).toBe("MARK");
    // The name remains one logical string across the highlight segments.
    expect(container.querySelector("h3")).toHaveTextContent("pdf-tools");
  });

  it("highlights repo and description matches case-insensitively", () => {
    renderWithRouter(
      <SkillCard
        skill={skill}
        matched={{ repo: ["anthropics"], description: ["pdf"] }}
      />,
    );

    // The description token "PDF" matches the lowercased term "pdf"; the
    // original casing is preserved inside the mark.
    expect(screen.getByText("anthropics").tagName).toBe("MARK");
    expect(screen.getByText("PDF").tagName).toBe("MARK");
  });

  it("does not mark tokens that only partially match a term", () => {
    const { container } = renderWithRouter(
      <SkillCard skill={skill} matched={{ name: ["pd"] }} />,
    );

    // Matched terms are always whole indexed tokens; "pd" is not.
    expect(container.querySelector("mark")).toBeNull();
    expect(screen.getByText("pdf")).toBeInTheDocument();
  });

  it("renders without any <mark> when nothing matched", () => {
    const { container } = renderWithRouter(<SkillCard skill={skill} />);

    expect(container.querySelector("mark")).toBeNull();
  });
});
