import { beforeEach, describe, it, expect, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { toast } from "sonner";

import { renderWithRouter } from "../test/test-utils";
import { fetchAgentStatus, linkAllAgents } from "../lib/local-skills";
import { excludeAgent } from "../lib/agent-link-preferences";
import type { AgentLinkResult, AgentStatus } from "../lib/skills-manager";
import { useAutoLinkAgents } from "./use-auto-link-agents";

vi.mock("../lib/local-skills", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/local-skills")>();
  return {
    ...actual,
    fetchAgentStatus: vi.fn(),
    linkAllAgents: vi.fn(),
  };
});

const fetchAgentStatusMock = vi.mocked(fetchAgentStatus);
const linkAllAgentsMock = vi.mocked(linkAllAgents);

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

/** Null-rendering probe, exactly how App mounts the hook. */
function Probe() {
  useAutoLinkAgents();
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  fetchAgentStatusMock.mockResolvedValue([agent({})]);
});

describe("useAutoLinkAgents", () => {
  it("links every unlinked non-canonical agent once, and stays silent", async () => {
    fetchAgentStatusMock.mockResolvedValue([
      agent({ name: "claude-code", display: "Claude Code", linked: true }),
      agent({ name: "windsurf", display: "Windsurf", canonical: true }),
      agent({ name: "cursor", display: "Cursor", internalSkills: ["pdf"] }),
      agent({ name: "gemini", display: "Gemini CLI" }),
    ]);
    linkAllAgentsMock.mockResolvedValue([
      result("migrated", {
        agent: "cursor",
        display: "Cursor",
        moved: ["pdf"],
      }),
      result("linked", { agent: "gemini", display: "Gemini CLI" }),
    ]);
    const toastErrorSpy = vi.spyOn(toast, "error");
    renderWithRouter(<Probe />);

    // One call carries every actionable agent, migrating their content.
    await waitFor(() =>
      expect(linkAllAgentsMock).toHaveBeenCalledWith(["cursor", "gemini"]),
    );
    expect(toastErrorSpy).not.toHaveBeenCalled();

    // The success invalidation refetches the status; the pass must not run
    // again on the fresh scan.
    await waitFor(() =>
      expect(fetchAgentStatusMock).toHaveBeenCalledTimes(2),
    );
    expect(linkAllAgentsMock).toHaveBeenCalledTimes(1);
  });

  it("skips agents the user excluded", async () => {
    excludeAgent("cursor");
    fetchAgentStatusMock.mockResolvedValue([
      agent({ name: "cursor", display: "Cursor" }),
      agent({ name: "gemini", display: "Gemini CLI" }),
    ]);
    linkAllAgentsMock.mockResolvedValue([
      result("linked", { agent: "gemini", display: "Gemini CLI" }),
    ]);
    renderWithRouter(<Probe />);

    await waitFor(() => expect(linkAllAgentsMock).toHaveBeenCalledWith(["gemini"]));
    expect(linkAllAgentsMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing when every agent is already linked or canonical", async () => {
    fetchAgentStatusMock.mockResolvedValue([
      agent({ name: "claude-code", display: "Claude Code", linked: true }),
      agent({ name: "windsurf", display: "Windsurf", canonical: true }),
    ]);
    renderWithRouter(<Probe />);

    await waitFor(() => expect(fetchAgentStatusMock).toHaveBeenCalled());
    // Flush the effect's turn before asserting the quiet path.
    await waitFor(() => {});
    expect(linkAllAgentsMock).not.toHaveBeenCalled();
  });

  it("surfaces per-agent failures in one error toast", async () => {
    linkAllAgentsMock.mockResolvedValue([
      result("linked"),
      result("failed", {
        agent: "gemini",
        display: "Gemini CLI",
        message: "permission denied",
      }),
    ]);
    fetchAgentStatusMock.mockResolvedValue([
      agent({}),
      agent({ name: "gemini", display: "Gemini CLI" }),
    ]);
    const toastErrorSpy = vi.spyOn(toast, "error");
    renderWithRouter(<Probe />);

    await waitFor(() =>
      expect(toastErrorSpy).toHaveBeenCalledWith(
        "自动链接部分 agent 失败：Gemini CLI 失败：permission denied",
      ),
    );
  });

  it("picks up a newly detected agent on a later scan, without retrying a failed one", async () => {
    // First scan: cursor fails to link; second scan (after the success
    // invalidation) reports cursor still unlinked plus a newly detected
    // agent — only the newcomer may be attempted.
    fetchAgentStatusMock
      .mockResolvedValueOnce([agent({ name: "cursor", display: "Cursor" })])
      .mockResolvedValue([
        agent({ name: "cursor", display: "Cursor" }),
        agent({ name: "delta", display: "Delta" }),
      ]);
    linkAllAgentsMock
      .mockResolvedValueOnce([
        result("failed", {
          agent: "cursor",
          display: "Cursor",
          message: "disk full",
        }),
      ])
      .mockResolvedValue([
        result("linked", { agent: "delta", display: "Delta" }),
      ]);
    renderWithRouter(<Probe />);

    await waitFor(() =>
      expect(linkAllAgentsMock).toHaveBeenCalledWith(["cursor"]),
    );
    await waitFor(() =>
      expect(linkAllAgentsMock).toHaveBeenCalledWith(["delta"]),
    );
    expect(linkAllAgentsMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces a hard failure of the batch call", async () => {
    linkAllAgentsMock.mockRejectedValue(new Error("boom"));
    const toastErrorSpy = vi.spyOn(toast, "error");
    renderWithRouter(<Probe />);

    await waitFor(() =>
      expect(toastErrorSpy).toHaveBeenCalledWith("自动链接 agent 失败：boom"),
    );
  });
});
