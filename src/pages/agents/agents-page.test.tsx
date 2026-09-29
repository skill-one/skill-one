import { describe, it, expect, vi, afterEach } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { toast } from "../../components/ui/toast";
import { renderWithRouter } from "../../test/test-utils";
import { getExcludedAgents } from "../../lib/agent-link-preferences";
import { setAgentsLayout } from "../../lib/agents-layout-preference";
import { resetMockAgentStatus } from "../../lib/mock-local";
import { AgentsPage } from "./agents-page";

function renderPage() {
  return renderWithRouter(<AgentsPage />, { route: "/" });
}

afterEach(() => {
  resetMockAgentStatus();
  // Link exclusions and the layout choice live in localStorage; neither must
  // leak across tests. The layout module also keeps a session fallback, so it
  // is restored to the default alongside the storage clear.
  window.localStorage.clear();
  setAgentsLayout("columns");
});

describe("AgentsPage", () => {
  it("states the idea in the head and the figures on the hub", async () => {
    renderPage();

    // The head is the value proposition, not a count; the hub card carries
    // the skill figures.
    expect(screen.getByText("安装一次，全 agents 直接使用")).toBeInTheDocument();

    // Every agent is one bare icon, reachable by its name.
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
    // The hub carries the attention count; the icon's edge and ribbon carry
    // the warning itself.
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

    // A canonical agent uses its native skills directory, so it cannot be
    // switched off: the icon is disabled and reads as pressed.
    const card = await screen.findByRole("button", { name: "Windsurf" });
    expect(card).toBeDisabled();
    expect(card).toHaveAttribute("aria-pressed", "true");
  });

  it("replays the entrance instead of hard-cutting on a layout switch", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("button", { name: "Claude Code" });

    // The toggle remounts the picture for the new presentation: the node
    // element itself is replaced, so the entrance cascade replays.
    const before = screen.getByRole("button", { name: "Claude Code" });
    await user.click(screen.getByRole("button", { name: "切换到星座" }));

    // The press persists…
    expect(window.localStorage.getItem("skill-one.agentsLayout")).toBe(
      "constellation",
    );
    // …and the picture remounts for the new presentation: the node element
    // itself is replaced, so the entrance cascade replays instead of jumping.
    expect(screen.getByRole("button", { name: "Claude Code" })).not.toBe(
      before,
    );
    expect(
      screen.getByRole("button", { name: "切换到分列" }),
    ).toBeInTheDocument();
  });

  it("re-renders when the layout preference changes elsewhere", async () => {
    const { container } = renderPage();
    await screen.findByRole("button", { name: "Claude Code" });

    // Columns first: the ribbon runs a horizontal S-curve.
    const d = () =>
      container
        .querySelector('svg g[data-agent="claude-code"] path')
        ?.getAttribute("d") ?? "";
    const before = d();
    expect(before).toMatch(/^M .* C .*$/);

    try {
      await act(async () => {
        setAgentsLayout("constellation");
      });

      // Constellation re-lays the same agent onto the Vogel spiral.
      expect(d()).not.toBe(before);
    } finally {
      // The preference module keeps a session fallback: restore the default
      // so later suites read a clean store.
      await act(async () => {
        setAgentsLayout("columns");
      });
    }
  });
});
