import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";

import { renderWithRouter } from "../../test/test-utils";
import type { AgentStatus, InstalledSkill } from "../../lib/skills-manager";
import { HubDashboard } from "./hub-dashboard";

const mockAgents: AgentStatus[] = [
  { name: "cursor", display: "Cursor", linked: true, canonical: false },
  { name: "claude-code", display: "Claude Code", linked: false, canonical: false, internalSkills: ["pdf"] },
];

const mockSkills: InstalledSkill[] = [
  { name: "pdf", displayName: "PDF", enabled: true, description: "PDF tool" },
  { name: "docx", displayName: "Docx", enabled: false, description: "Docx tool" },
];

describe("HubDashboard", () => {
  it("renders hub figure with floating notch, brand logo, stats, and enabled skills", () => {
    renderWithRouter(
      <HubDashboard agents={mockAgents} skills={mockSkills} />,
    );

    const figure = screen.getByRole("figure");
    expect(figure).toBeInTheDocument();
    expect(screen.getByText("SkillOne 共享中心")).toBeInTheDocument();
    expect(screen.getByText("安装一次，全 agents 直接使用")).toBeInTheDocument();

    // Brand logo image in notch
    const logo = screen.getByAltText("Skill One");
    expect(logo).toHaveAttribute("src", "/skill-one-transparent.png");

    // Skills stats in floating badge
    expect(screen.getByText("1")).toBeInTheDocument(); // 1 enabled
    expect(screen.getByText("/2")).toBeInTheDocument(); // of 2 total

    // Redundant navigation buttons and domain summary bar are removed
    expect(screen.queryByRole("link", { name: /商店/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /管理/ })).toBeNull();
    expect(screen.queryByText(/已启用技能:/)).toBeNull();

    // Enabled skills rendered
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.queryByText("Docx")).toBeNull();
  });

  it("renders empty state when no skills are enabled", () => {
    const disabledSkills: InstalledSkill[] = [
      { name: "pdf", displayName: "PDF", enabled: false, description: "PDF tool" },
    ];
    renderWithRouter(
      <HubDashboard agents={mockAgents} skills={disabledSkills} />,
    );

    expect(screen.getByText("还没有启用的技能")).toBeInTheDocument();
  });

  it("adapts gracefully to 100+ skills with view-all link", () => {
    const manySkills: InstalledSkill[] = Array.from({ length: 105 }, (_, i) => ({
      name: `skill-${i}`,
      displayName: `Skill ${i}`,
      enabled: true,
      description: `Description for skill ${i}`,
    }));

    renderWithRouter(
      <HubDashboard agents={mockAgents} skills={manySkills} />,
    );

    // Total counts 105
    expect(screen.getAllByText("105").length).toBeGreaterThan(0);

    // Interactive link to see all 105 skills in installed page
    const viewAllLink = screen.getByRole("link", {
      name: "查看全部 105 个技能",
    });
    expect(viewAllLink).toBeInTheDocument();
    expect(viewAllLink).toHaveAttribute("href", "/installed");
    expect(viewAllLink).toHaveTextContent("+55");
  });

  it("renders skills cleanly with avatars without redundant category summary bar", () => {
    const unclassifiedSkills: InstalledSkill[] = Array.from(
      { length: 17 },
      (_, i) => ({
        name: `skill-${i}`,
        displayName: `Skill ${i}`,
        enabled: true,
        description: `Description for skill ${i}`,
      }),
    );

    renderWithRouter(
      <HubDashboard agents={mockAgents} skills={unclassifiedSkills} />,
    );

    // Redundant category summary bar is omitted
    expect(screen.queryByText(/已启用技能:/)).toBeNull();

    // Each skill chip renders an avatar mark
    const marks = screen.getAllByRole("img", { name: "第三方安装" });
    expect(marks.length).toBe(17);
  });
});
