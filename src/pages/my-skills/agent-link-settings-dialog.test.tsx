import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import { renderWithRouter } from "../../test/test-utils";
import {
  fetchAgentStatus,
  linkAgent,
  unlinkAgent,
} from "../../lib/local-skills";
import {
  excludeAgent,
  getExcludedAgents,
} from "../../lib/agent-link-preferences";
import type { AgentLinkResult, AgentStatus } from "../../lib/skills-manager";
import { AgentLinkSettingsDialog } from "./agent-link-settings-dialog";

vi.mock("../../lib/local-skills", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/local-skills")>();
  return {
    ...actual,
    fetchAgentStatus: vi.fn(),
    linkAgent: vi.fn(),
    unlinkAgent: vi.fn(),
  };
});

const fetchAgentStatusMock = vi.mocked(fetchAgentStatus);
const linkAgentMock = vi.mocked(linkAgent);
const unlinkAgentMock = vi.mocked(unlinkAgent);

function agent(overrides: Partial<AgentStatus>): AgentStatus {
  return {
    name: "cursor",
    display: "Cursor",
    linked: false,
    canonical: false,
    ...overrides,
  };
}

function result(
  status: AgentLinkResult["status"],
  overrides: Partial<AgentLinkResult> = {},
): AgentLinkResult {
  return {
    agent: "cursor",
    display: "Cursor",
    status,
    moved: [],
    skipped: [],
    parkedSkills: [],
    parkedOthers: [],
    backupDir: null,
    restored: [],
    restoredFrom: null,
    message: null,
    ...overrides,
  };
}

function renderDialog() {
  return renderWithRouter(
    <AgentLinkSettingsDialog open onOpenChange={() => {}} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  fetchAgentStatusMock.mockResolvedValue([agent({})]);
});

describe("AgentLinkSettingsDialog", () => {
  it("renders one switch per agent, reflecting its link state", async () => {
    fetchAgentStatusMock.mockResolvedValue([
      agent({ name: "claude-code", display: "Claude Code", linked: true }),
      agent({ name: "windsurf", display: "Windsurf", canonical: true }),
      agent({ name: "cursor", display: "Cursor" }),
    ]);
    renderDialog();

    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByRole("switch", { name: "Claude Code 链接开关" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      await within(dialog).findByRole("switch", { name: "Cursor 链接开关" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("unlinks on switch-off and records the exclusion", async () => {
    const user = userEvent.setup();
    fetchAgentStatusMock.mockResolvedValue([
      agent({
        linked: true,
        pendingBackup: { path: "/backup/cursor", items: ["README.md"] },
      }),
    ]);
    unlinkAgentMock.mockResolvedValue([
      result("unlinked", { restored: ["README.md"] }),
    ]);
    const successSpy = vi.spyOn(toast, "success");
    renderDialog();

    const dialog = await screen.findByRole("dialog");
    await user.click(
      await within(dialog).findByRole("switch", { name: "Cursor 链接开关" }),
    );

    expect(unlinkAgentMock).toHaveBeenCalledWith("cursor");
    expect(linkAgentMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(getExcludedAgents()).toEqual(["cursor"]),
    );
    expect(successSpy).toHaveBeenCalledWith(
      "Cursor 已取消链接（已恢复 1 项备份内容）",
    );
  });

  it("links on switch-on with migrate and clears the exclusion", async () => {
    const user = userEvent.setup();
    excludeAgent("cursor");
    fetchAgentStatusMock.mockResolvedValue([
      agent({ internalSkills: ["pdf"], internalOthers: ["README.md"] }),
    ]);
    linkAgentMock.mockResolvedValue([
      result("migrated", { moved: ["pdf"], parkedOthers: ["README.md"] }),
    ]);
    const successSpy = vi.spyOn(toast, "success");
    renderDialog();

    const dialog = await screen.findByRole("dialog");
    await user.click(
      await within(dialog).findByRole("switch", { name: "Cursor 链接开关" }),
    );

    // One call does it all: skills move into the canonical dir, everything
    // else parks into the backup slot.
    expect(linkAgentMock).toHaveBeenCalledWith("cursor", { migrate: true });
    await waitFor(() => expect(getExcludedAgents()).toEqual([]));
    expect(successSpy).toHaveBeenCalledWith(
      "Cursor 已导入（移动 1 个 skills，其余文件已备份）",
    );
  });

  it("surfaces a hard failure as an error toast", async () => {
    const user = userEvent.setup();
    fetchAgentStatusMock.mockResolvedValue([agent({ linked: true })]);
    unlinkAgentMock.mockRejectedValue(new Error("boom"));
    const errorSpy = vi.spyOn(toast, "error");
    renderDialog();

    const dialog = await screen.findByRole("dialog");
    await user.click(
      await within(dialog).findByRole("switch", { name: "Cursor 链接开关" }),
    );

    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith("boom"));
  });
});
