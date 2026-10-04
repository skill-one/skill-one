import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithRouter } from "../../test/test-utils";
import type { AgentStatus, InstalledSkill } from "../../lib/skills-manager";
import { AgentDetailDialog } from "./agent-detail-dialog";

const mockAgent: AgentStatus = {
  name: "cursor",
  display: "Cursor",
  linked: true,
  canonical: false,
};

const mockWarningAgent: AgentStatus = {
  name: "claude-code",
  display: "Claude Code",
  linked: false,
  canonical: false,
  internalSkills: ["pdf", "docx"],
  internalOthers: ["extra.json"],
};

const mockCanonicalAgent: AgentStatus = {
  name: "windsurf",
  display: "Windsurf",
  linked: false,
  canonical: true,
};

const mockSkills: InstalledSkill[] = [
  { name: "pdf", displayName: "PDF Viewer", enabled: true, description: "View pdfs" },
  { name: "docx", displayName: "Docx Editor", enabled: false, description: "Edit docx" },
];

describe("AgentDetailDialog", () => {
  it("renders agent title, link state and active skills", () => {
    renderWithRouter(
      <AgentDetailDialog
        agent={mockAgent}
        open={true}
        onOpenChange={vi.fn()}
        onToggleLink={vi.fn()}
        installedSkills={mockSkills}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Cursor")).toBeInTheDocument();
    expect(screen.getAllByText(/已连接/).length).toBeGreaterThan(0);
    expect(screen.getByText(/~\/\.cursor\/skills/)).toBeInTheDocument();
    expect(screen.getByText("PDF Viewer")).toBeInTheDocument();
    // docx is disabled, so not active
    expect(screen.queryByText("Docx Editor")).toBeNull();
  });

  it("displays warning alerts for agents with internal files", () => {
    renderWithRouter(
      <AgentDetailDialog
        agent={mockWarningAgent}
        open={true}
        onOpenChange={vi.fn()}
        onToggleLink={vi.fn()}
        installedSkills={mockSkills}
      />,
    );

    expect(screen.getByText("待处理")).toBeInTheDocument();
    expect(screen.getByText(/检测到本地原有技能/)).toBeInTheDocument();
    expect(screen.getByText(/pdf, docx/)).toBeInTheDocument();
    expect(screen.getByText(/extra.json/)).toBeInTheDocument();
  });

  it("handles link toggling via switch inside dialog", async () => {
    const user = userEvent.setup();
    const toggleSpy = vi.fn();

    renderWithRouter(
      <AgentDetailDialog
        agent={mockAgent}
        open={true}
        onOpenChange={vi.fn()}
        onToggleLink={toggleSpy}
        installedSkills={mockSkills}
      />,
    );

    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.click(toggle);

    expect(toggleSpy).toHaveBeenCalledWith("cursor", false);
  });

  it("disables the switch for canonical host agent", () => {
    renderWithRouter(
      <AgentDetailDialog
        agent={mockCanonicalAgent}
        open={true}
        onOpenChange={vi.fn()}
        onToggleLink={vi.fn()}
        installedSkills={mockSkills}
      />,
    );

    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("原生宿主")).toBeInTheDocument();
  });
});
