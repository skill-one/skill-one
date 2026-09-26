import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { toast } from "../../components/ui/toast";
import { renderWithRouter } from "../../test/test-utils";
import { getExcludedAgents } from "../../lib/agent-link-preferences";
import { resetMockAgentStatus } from "../../lib/mock-local";
import { AgentsPage } from "./agents-page";

function renderPage() {
  return renderWithRouter(<AgentsPage />, { route: "/my-skills/agents" });
}

afterEach(() => {
  resetMockAgentStatus();
  // Link exclusions live in localStorage; one test's opt-out must not leak.
  window.localStorage.clear();
});

describe("AgentsPage", () => {
  it("draws every detected agent in the graph and states the summary", async () => {
    renderPage();

    // Three of the five mock agents are effectively linked (two linked plus
    // the canonical one); the summary in the head states it.
    expect(
      await screen.findByText("已连接 3/5 个 agent"),
    ).toBeInTheDocument();

    // Every agent is a node card, each with its link state.
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
    expect(screen.getByText("Cursor")).toBeInTheDocument();
    expect(screen.getByText("Gemini CLI")).toBeInTheDocument();
    expect(screen.getByText("Windsurf")).toBeInTheDocument();
  });

  it("flags the agent whose own directory already holds content", async () => {
    renderPage();
    expect(await screen.findByText("已连接 3/5 个 agent")).toBeInTheDocument();
    // The head carries the attention count, and the node card carries the
    // pending adoption/quarantine counts.
    expect(screen.getByText(/1 个待处理/)).toBeInTheDocument();
    expect(screen.getByText("2 个 skill")).toBeInTheDocument();
    expect(screen.getByText("1 项文件")).toBeInTheDocument();
  });

  it("links an agent straight from its node card and re-renders the graph", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    expect(await screen.findByText("已连接 3/5 个 agent")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Gemini CLI" }));
    const popover = await screen.findByRole("dialog");
    await user.click(
      within(popover).getByRole("switch", { name: "Gemini CLI 链接开关" }),
    );

    // The head summary flips to 4/5 and the ribbon joins the linked set.
    expect(
      await screen.findByText("已连接 4/5 个 agent"),
    ).toBeInTheDocument();
    const group = container.querySelector('g[data-agent="gemini-cli"]')!;
    expect(group.getAttribute("data-state")).toBe("linked");
  });

  it("offers the way back to the installed list", async () => {
    renderPage();
    const back = await screen.findByRole("link", { name: "返回" });
    expect(back).toHaveAttribute("href", "/my-skills");
  });

  it("unlinks a linked agent from the settings dialog and remembers it", async () => {
    const user = userEvent.setup();
    const successSpy = vi.spyOn(toast, "add");
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Agent 链接设置" }),
    );

    const dialog = await screen.findByRole("dialog");
    await user.click(
      await within(dialog).findByRole("switch", {
        name: "Claude Code 链接开关",
      }),
    );

    expect(successSpy).toHaveBeenCalledWith({
      title: "Claude Code 已取消链接",
      type: "success",
    });
    expect(getExcludedAgents()).toEqual(["claude-code"]);
  });

  it("re-links an unlinked agent from the settings dialog", async () => {
    const user = userEvent.setup();
    const successSpy = vi.spyOn(toast, "add");
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Agent 链接设置" }),
    );

    const dialog = await screen.findByRole("dialog");
    await user.click(
      await within(dialog).findByRole("switch", {
        name: "Gemini CLI 链接开关",
      }),
    );

    expect(successSpy).toHaveBeenCalledWith({
      title: "Gemini CLI 已链接",
      type: "success",
    });
    expect(getExcludedAgents()).toEqual([]);
  });

  it("pins a canonical agent's switch in the settings dialog", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Agent 链接设置" }),
    );

    const dialog = await screen.findByRole("dialog");
    const switchEl = await within(dialog).findByRole("switch", {
      name: "Windsurf 链接开关",
    });
    expect(switchEl).toHaveAttribute("aria-disabled", "true");
    expect(switchEl).toHaveAttribute("aria-checked", "true");
  });
});
