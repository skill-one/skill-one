import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithRouter } from "../../test/test-utils";
import type { AgentStatus } from "../../lib/skills-manager";
import { AgentAvatarGroup, AVATAR_GROUP_MAX } from "./agent-avatar-group";

function agent(overrides: Partial<AgentStatus>): AgentStatus {
  return {
    name: "cursor",
    display: "Cursor",
    linked: false,
    canonical: false,
    ...overrides,
  };
}

function agents(count: number): AgentStatus[] {
  return Array.from({ length: count }, (_, i) =>
    agent({ name: `agent-${i}`, display: `Agent ${i}` }),
  );
}

describe("AgentAvatarGroup", () => {
  it("shows at most AVATAR_GROUP_MAX avatars plus a +N count", () => {
    const total = AVATAR_GROUP_MAX + 3;
    renderWithRouter(<AgentAvatarGroup agents={agents(total)} onExpand={() => {}} />);

    expect(screen.getAllByRole("button")).toHaveLength(AVATAR_GROUP_MAX + 1);
    const count = screen.getByRole("button", { name: `展开全部 ${total} 个 agent` });
    expect(count).toHaveTextContent("+3");
  });

  it("omits the count when every agent fits inline", () => {
    renderWithRouter(
      <AgentAvatarGroup agents={agents(AVATAR_GROUP_MAX)} onExpand={() => {}} />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(AVATAR_GROUP_MAX);
    expect(screen.queryByRole("button", { name: /^展开全部/ })).not.toBeInTheDocument();
  });

  it("exposes each agent's link state through the avatar label", () => {
    // Only the first AVATAR_GROUP_MAX agents render inline, so each state is
    // asserted in the visible slot one render at a time.
    const cases: Array<[AgentStatus[], string]> = [
      [[agent({ name: "codex", display: "Codex", linked: true })], "Codex，已链接，点击展开"],
      [
        [agent({ name: "windsurf", display: "Windsurf", canonical: true })],
        "Windsurf，原生，点击展开",
      ],
      [
        [agent({ name: "goose", display: "Goose", internalSkills: ["pdf"] })],
        "Goose，未链接，点击展开",
      ],
      [[agent({ name: "cursor", display: "Cursor" })], "Cursor，未链接，点击展开"],
    ];

    for (const [list, label] of cases) {
      const { unmount } = renderWithRouter(
        <AgentAvatarGroup agents={list} onExpand={() => {}} />,
      );
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
      unmount();
    }
  });

  it("expands on any click and never acts on the agent itself", async () => {
    const user = userEvent.setup();
    const onExpand = vi.fn();
    renderWithRouter(<AgentAvatarGroup agents={agents(10)} onExpand={onExpand} />);

    await user.click(
      screen.getByRole("button", { name: "Agent 1，未链接，点击展开" }),
    );
    expect(onExpand).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "展开全部 10 个 agent" }));
    expect(onExpand).toHaveBeenCalledTimes(2);
  });

  it("previews the status on hover", async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <AgentAvatarGroup agents={[agent({ linked: true })]} onExpand={() => {}} />,
    );

    await user.hover(
      screen.getByRole("button", { name: "Cursor，已链接，点击展开" }),
    );
    expect(await screen.findByText("点击展开全部 agent")).toBeInTheDocument();
  });
});
