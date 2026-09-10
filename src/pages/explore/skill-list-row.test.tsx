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
    expect(screen.getByText("anthropics/skills")).toBeInTheDocument();
    expect(
      screen.getByText("Read and merge PDF documents."),
    ).toBeInTheDocument();
    // One blended figure inline; neither source count leaks into the row.
    expect(screen.getByText(BLENDED)).toBeInTheDocument();
    expect(screen.queryByText("3M")).not.toBeInTheDocument();
    expect(screen.queryByText("169.6K")).not.toBeInTheDocument();
  });

  it("breaks the figure down into installs and stars on hover", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SkillListRow skill={skill} />);

    await user.hover(screen.getByRole("button", { name: /^热度 / }));
    const tip = await screen.findByRole("tooltip");

    // Labelled, so the blend is never mistaken for a count of anything.
    expect(within(tip).getByText("热度")).toHaveTextContent("热度");
    expect(within(tip).getByText("712.4K")).toBeInTheDocument();
    expect(within(tip).getByText("安装")).toBeInTheDocument();
    expect(within(tip).getByText("3M")).toBeInTheDocument();
    expect(within(tip).getByText("Star")).toBeInTheDocument();
    expect(within(tip).getByText("169.6K")).toBeInTheDocument();
  });

  it("labels the figure with its breakdown for assistive tech", () => {
    renderWithRouter(<SkillListRow skill={skill} />);

    expect(
      screen.getByRole("button", {
        name: "热度 712.4K：安装 3M · Star 169.6K",
      }),
    ).toBeInTheDocument();
  });

  it("reaches the same breakdown from the keyboard", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SkillListRow skill={skill} />);

    // The metric is the row's first control, so one tab lands on it and the
    // tooltip opens the same way it does for a pointer.
    await user.tab();
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

  it("shows a surface-provided metric instead of the blend", () => {
    renderWithRouter(
      <SkillListRow skill={skill} metric={<span>5K</span>} />,
    );

    // Leaderboards rank in their own unit, so they replace the metric whole.
    expect(screen.getByText("5K")).toBeInTheDocument();
    expect(screen.queryByText(BLENDED)).not.toBeInTheDocument();
  });

  it("keeps a missing description readable", () => {
    renderWithRouter(<SkillListRow skill={{ ...skill, description: "" }} />);

    // A row is one fixed-height line, so an empty description falls back to a
    // placeholder instead of collapsing the row's second line.
    expect(screen.getByText("暂无描述")).toBeInTheDocument();
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
    expect(installSkillFromSource).toHaveBeenCalledWith(skill.repo, skill.name);
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
      <SkillListRow
        skill={skill}
        matched={{ repo: ["anthropics"], description: ["pdf"] }}
      />,
    );

    // Whole tokens only, case-insensitive, with the original casing kept.
    expect(screen.getByText("anthropics").tagName).toBe("MARK");
    expect(screen.getByText("PDF").tagName).toBe("MARK");
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

  it("does not mark a token that only partially matches", () => {
    const { container } = renderWithRouter(
      <SkillListRow skill={skill} matched={{ name: ["pd"] }} />,
    );

    // Matched terms are always whole indexed tokens; "pd" is not one.
    expect(container.querySelector("mark")).toBeNull();
    expect(screen.getByText("pdf")).toBeInTheDocument();
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
        skill={{ ...skill, profile: { domain: "内容创作" } }}
      />,
    );

    expect(screen.getByText("内容创作")).toBeInTheDocument();
  });

  it("shows no domain badge for an unprofiled skill", () => {
    renderWithRouter(<SkillListRow skill={skill} />);

    expect(screen.queryByText("内容创作")).not.toBeInTheDocument();
  });
});
