import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MyAgentsPage } from "./my-agents-page";
import { renderWithRouter } from "../test/test-utils";
import type { AgentLinkResult, InstalledSkill } from "../lib/skills-manager";

/**
 * The refusal path only exists behind the native backend: the browser mock
 * store always links successfully. So the data layer is mocked here to drive
 * the "link refused -> confirm migration -> link again with migrate" wiring.
 */
const { linkAgent, unlinkAgent, fetchAgentStatus, fetchInstalledSkills } =
  vi.hoisted(() => ({
    linkAgent: vi.fn(),
    unlinkAgent: vi.fn(),
    fetchAgentStatus: vi.fn(),
    fetchInstalledSkills: vi.fn(),
  }));

vi.mock("../lib/local-skills", () => ({
  linkAgent,
  unlinkAgent,
  fetchAgentStatus,
  fetchInstalledSkills,
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

function installed(name: string): InstalledSkill {
  return {
    name,
    path: `${CANONICAL}/${name}`,
    scope: "global",
    agents: [],
    source: null,
    sourceUrl: null,
    sourceType: null,
  };
}

describe("MyAgentsPage migration flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchAgentStatus.mockResolvedValue([
      { name: "cursor", display: "Cursor", linked: false, canonical: false },
    ]);
    // The canonical dir already holds xlsx, so migration would skip it.
    fetchInstalledSkills.mockResolvedValue([installed("xlsx")]);
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

  it("opens the migration dialog instead of reporting the refusal", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MyAgentsPage />);

    await user.click(await screen.findByRole("button", { name: "链接" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("xlsx")).toBeInTheDocument();
    // The refusal itself must not surface as a notice.
    expect(screen.queryByText(/拒绝/)).not.toBeInTheDocument();
  });

  it("marks the skill the canonical dir already provides", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MyAgentsPage />);

    await user.click(await screen.findByRole("button", { name: "链接" }));
    await screen.findByRole("dialog");

    expect(
      await screen.findByText("将跳过，保留规范目录版本"),
    ).toBeInTheDocument();
  });

  it("migrates and links after confirmation", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MyAgentsPage />);

    await user.click(await screen.findByRole("button", { name: "链接" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "确认迁移" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(linkAgent).toHaveBeenLastCalledWith("cursor", { migrate: true });
    expect(
      screen.getByText("Cursor（cursor） 已迁移（移动 1 个，跳过 1 个）"),
    ).toBeInTheDocument();
  });

  it("leaves everything untouched when cancelled", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MyAgentsPage />);

    await user.click(await screen.findByRole("button", { name: "链接" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(linkAgent).toHaveBeenCalledTimes(1);
    expect(linkAgent).toHaveBeenCalledWith("cursor");
  });

  it("blocks migration while non-skill files remain", async () => {
    linkAgent.mockResolvedValue([
      {
        ...BASE,
        status: "refused",
        skills: ["pdf"],
        message: `${AGENT_DIR} has existing skills and non-skill files; remove the files (README.md), then rerun with --migrate`,
      },
    ]);
    const user = userEvent.setup();
    renderWithRouter(<MyAgentsPage />);

    await user.click(await screen.findByRole("button", { name: "链接" }));
    await screen.findByRole("dialog");

    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认迁移" })).toBeDisabled();
  });
});
