import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MyAgentsPage } from "./my-agents-page";
import { renderWithRouter } from "../test/test-utils";
import type { AgentLinkResult } from "../lib/skills-manager";

/**
 * The pre-link detection lives behind the native backend: the browser mock
 * always links successfully and never reports contained skills. So the data
 * layer is mocked here to drive the "agent carries skills -> card shows them
 * and 迁移并链接 -> click migrates directly (no dialog)" wiring.
 */
const { linkAgent, unlinkAgent, fetchAgentStatus } = vi.hoisted(() => ({
  linkAgent: vi.fn(),
  unlinkAgent: vi.fn(),
  fetchAgentStatus: vi.fn(),
}));

vi.mock("../lib/local-skills", () => ({
  linkAgent,
  unlinkAgent,
  fetchAgentStatus,
}));

const AGENT_DIR = "/Users/me/.cursor/skills";
const CANONICAL = "/Users/me/.agents/skills";

const BASE: AgentLinkResult = {
  agent: "cursor",
  display: "Cursor",
  status: "refused",
  moved: [],
  skipped: [],
  skills: [],
  message: null,
};

describe("MyAgentsPage migration flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Pre-detection reports that cursor carries pdf + xlsx in its own dir.
    fetchAgentStatus.mockResolvedValue([
      {
        name: "cursor",
        display: "Cursor",
        linked: false,
        canonical: false,
        skills: ["pdf", "xlsx"],
      },
    ]);
    linkAgent.mockImplementation(
      async (_name: string, options?: { migrate?: boolean }) => {
        if (options?.migrate) {
          return [
            {
              ...BASE,
              status: "migrated",
              moved: ["pdf"],
              skipped: ["xlsx"],
            },
          ];
        }
        return [
          {
            ...BASE,
            status: "refused",
            skills: ["pdf", "xlsx"],
            message: `${AGENT_DIR} has existing skills; rerun with --migrate to move them into ${CANONICAL}`,
          },
        ];
      },
    );
  });

  it("shows the contained skills and a 迁移并链接 button (no dialog)", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MyAgentsPage />);

    expect(await screen.findByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("xlsx")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "迁移并链接" }),
    ).toBeInTheDocument();
    // No confirmation dialog is shown before the user acts.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("migrates and links directly on 迁移并链接", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MyAgentsPage />);

    await user.click(
      await screen.findByRole("button", { name: "迁移并链接" }),
    );

    await waitFor(() => {
      expect(linkAgent).toHaveBeenLastCalledWith("cursor", { migrate: true });
    });
    expect(
      screen.getByText("Cursor（cursor） 已迁移（移动 1 个，跳过 1 个）"),
    ).toBeInTheDocument();
  });

  it("falls back to migration when a plain 链接 is refused", async () => {
    const user = userEvent.setup();
    // Pre-detection missed the contained skills, but the backend still refuses.
    fetchAgentStatus.mockResolvedValue([
      {
        name: "cursor",
        display: "Cursor",
        linked: false,
        canonical: false,
        skills: [],
      },
    ]);
    renderWithRouter(<MyAgentsPage />);

    await user.click(await screen.findByRole("button", { name: "链接" }));

    await waitFor(() => {
      expect(linkAgent).toHaveBeenLastCalledWith("cursor", { migrate: true });
    });
  });
});
