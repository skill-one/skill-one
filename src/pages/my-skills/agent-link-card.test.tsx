import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";

import { renderWithRouter } from "../../test/test-utils";
import { fetchAgentStatus } from "../../lib/local-skills";
import type { AgentStatus } from "../../lib/skills-manager";
import { AgentLinkCard } from "./agent-link-card";

vi.mock("../../lib/local-skills", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../lib/local-skills")>();
  return { ...actual, fetchAgentStatus: vi.fn() };
});

const fetchMock = vi.mocked(fetchAgentStatus);

function agent(overrides: Partial<AgentStatus>): AgentStatus {
  return {
    name: "cursor",
    display: "Cursor",
    linked: false,
    canonical: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgentLinkCard", () => {
  it("summarises detected agents and links into the agents graph", async () => {
    fetchMock.mockResolvedValue([
      agent({ name: "claude-code", display: "Claude Code", linked: true }),
      agent({ name: "codex", display: "Codex", linked: true }),
      agent({ name: "cursor", display: "Cursor" }),
      agent({
        name: "gemini-cli",
        display: "Gemini CLI",
        internalSkills: ["pdf"],
      }),
      agent({ name: "windsurf", display: "Windsurf", canonical: true }),
    ]);
    renderWithRouter(<AgentLinkCard />);

    const link = await screen.findByRole("link", {
      name: "打开 agents 页面",
    });
    expect(link).toHaveAttribute("href", "/my-skills/agents");
    expect(screen.getByText("Agent 连接")).toBeInTheDocument();
    expect(screen.getByText("已连接 3/5")).toBeInTheDocument();
    // The one agent with pending content surfaces the attention figure.
    expect(screen.getByText(/1 个待处理/)).toBeInTheDocument();
  });

  it("folds faces past five into a +N count", async () => {
    fetchMock.mockResolvedValue(
      Array.from({ length: 7 }, (_, i) =>
        agent({ name: `agent-${i}`, display: `Agent ${i}`, linked: true }),
      ),
    );
    renderWithRouter(<AgentLinkCard />);
    expect(await screen.findByText("+2")).toBeInTheDocument();
  });

  it("still offers the entry when no agent has been detected", async () => {
    fetchMock.mockResolvedValue([]);
    renderWithRouter(<AgentLinkCard />);
    expect(
      await screen.findByText("未检测到可用的 agent"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "打开 agents 页面" }),
    ).toHaveAttribute("href", "/my-skills/agents");
  });

  it("renders nothing when the status read fails", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));
    const { container } = renderWithRouter(<AgentLinkCard />);
    // React Query needs a tick to settle the rejection.
    await vi.waitFor(() =>
      expect(container.querySelector("a")).not.toBeInTheDocument(),
    );
  });
});
