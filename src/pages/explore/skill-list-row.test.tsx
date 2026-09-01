import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
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

describe("SkillListRow", () => {
  beforeEach(() => {
    // No skills are installed unless a test says otherwise.
    vi.mocked(fetchInstalledSkills).mockResolvedValue([]);
  });

  it("renders as a list item with name, repo, description and downloads", () => {
    const { container } = renderWithRouter(<SkillListRow skill={skill} />);

    expect(container.querySelector("li")).not.toBeNull();
    expect(screen.getByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("anthropics/skills")).toBeInTheDocument();
    expect(
      screen.getByText("Read and merge PDF documents."),
    ).toBeInTheDocument();
    // Compact download count, and deliberately no star count.
    expect(screen.getByText("3M")).toBeInTheDocument();
    expect(screen.queryByText("169.6K")).not.toBeInTheDocument();
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

  it("renders downloads of 0 rather than hiding a missing metric", () => {
    renderWithRouter(<SkillListRow skill={{ ...skill, downloads: 0 }} />);

    expect(screen.getByText("0")).toBeInTheDocument();
    // Stars never render, not even when the underlying data is present.
    expect(screen.queryByText("169.6K")).not.toBeInTheDocument();
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
});
