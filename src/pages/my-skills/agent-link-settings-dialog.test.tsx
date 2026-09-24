import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "../../components/ui/toast";

import { renderWithRouter } from "../../test/test-utils";
import { LANGUAGE_STORAGE_KEY } from "../../lib/i18n-content";
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
    adopted: [],
    quarantined: [],
    conflicts: [],
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
  // Re-pin the language preference the global setup set before this clear.
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "zh");
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
    fetchAgentStatusMock.mockResolvedValue([agent({ linked: true })]);
    unlinkAgentMock.mockResolvedValue([result("unlinked")]);
    const successSpy = vi.spyOn(toast, "add");
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
    // Nothing to restore since agents-skills 0.15: the toast only reports the
    // unlink itself.
    expect(successSpy).toHaveBeenCalledWith({
      title: "Cursor 已取消链接",
      type: "success",
    });
  });

  it("links on switch-on, reporting adopted and quarantined content", async () => {
    const user = userEvent.setup();
    excludeAgent("cursor");
    fetchAgentStatusMock.mockResolvedValue([
      agent({ internalSkills: ["pdf"], internalOthers: ["README.md"] }),
    ]);
    linkAgentMock.mockResolvedValue([
      result("linked", { adopted: ["pdf"], quarantined: ["README.md"] }),
    ]);
    const successSpy = vi.spyOn(toast, "add");
    renderDialog();

    const dialog = await screen.findByRole("dialog");
    await user.click(
      await within(dialog).findByRole("switch", { name: "Cursor 链接开关" }),
    );

    // One call does it all: skills are adopted into the canonical dir, other
    // files are quarantined under .misc.
    expect(linkAgentMock).toHaveBeenCalledWith("cursor");
    await waitFor(() => expect(getExcludedAgents()).toEqual([]));
    expect(successSpy).toHaveBeenCalledWith({
      title: "Cursor 已链接（收编 1 个 skill，隔离 1 项文件）",
      type: "success",
    });
  });

  it("surfaces a hard failure as an error toast", async () => {
    const user = userEvent.setup();
    fetchAgentStatusMock.mockResolvedValue([agent({ linked: true })]);
    unlinkAgentMock.mockRejectedValue(new Error("boom"));
    const errorSpy = vi.spyOn(toast, "add");
    renderDialog();

    const dialog = await screen.findByRole("dialog");
    await user.click(
      await within(dialog).findByRole("switch", { name: "Cursor 链接开关" }),
    );

    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith({ title: "boom", type: "error" }),
    );
  });
});
