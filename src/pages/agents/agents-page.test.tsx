import { describe, it, expect, vi, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { toast } from "../../components/ui/toast";
import { renderWithRouter } from "../../test/test-utils";
import { getExcludedAgents } from "../../lib/agent-link-preferences";
import { resetMockAgentStatus } from "../../lib/mock-local";
import { AgentsPage } from "./agents-page";

function renderPage() {
  return renderWithRouter(<AgentsPage />, { route: "/" });
}

afterEach(() => {
  resetMockAgentStatus();
  window.localStorage.clear();
});

describe("AgentsPage", () => {
  it("renders all detected agent pills and the central hub without redundant top headers", async () => {
    renderPage();

    // Central hub is present with brand title and unified stats
    expect(await screen.findByText("SkillOne 共享中心")).toBeInTheDocument();

    // Redundant top level-1 heading removed; status indicator lives in central hub
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();

    // Every agent is rendered as a clean pill reachable by its name
    for (const name of [
      "Claude Code",
      "Codex",
      "Cursor",
      "Gemini CLI",
      "Windsurf",
    ]) {
      expect(
        await screen.findByRole("button", { name }),
      ).toBeInTheDocument();
    }
  });

  it("flags, on the hub, the agent whose own directory already holds content", async () => {
    renderPage();
    expect(await screen.findByText(/1 个待处理/)).toBeInTheDocument();
  });

  it("links an agent by clicking its icon and re-renders the graph", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await screen.findByRole("button", { name: "Gemini CLI" });

    // The icon is the toggle: one click links the agent.
    await user.click(screen.getByRole("button", { name: "Gemini CLI" }));

    // The ribbon joins the linked set.
    const group = container.querySelector('g[data-agent="gemini-cli"]')!;
    expect(group.getAttribute("data-state")).toBe("linked");
  });

  it("unlinks a linked agent by clicking its icon and remembers it", async () => {
    const user = userEvent.setup();
    const successSpy = vi.spyOn(toast, "add");
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Claude Code" }),
    );

    expect(successSpy).toHaveBeenCalledWith({
      title: "Claude Code 已取消链接",
      type: "success",
    });
    expect(getExcludedAgents()).toEqual(["claude-code"]);
  });

  it("re-links an unlinked agent by clicking its icon", async () => {
    const user = userEvent.setup();
    const successSpy = vi.spyOn(toast, "add");
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Gemini CLI" }));

    expect(successSpy).toHaveBeenCalledWith({
      title: "Gemini CLI 已链接",
      type: "success",
    });
    expect(getExcludedAgents()).toEqual([]);
  });

  it("leaves a canonical agent's icon inert", async () => {
    renderPage();

    const card = await screen.findByRole("button", { name: "Windsurf" });
    expect(card).toBeDisabled();
    expect(card).toHaveAttribute("aria-pressed", "true");
  });
});
