import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

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

/** Avatars and the +N count carry no text of their own, so query by slot. */
function slots(container: HTMLElement, slot: string): Element[] {
  return Array.from(container.querySelectorAll(`[data-slot="${slot}"]`));
}

describe("AgentAvatarGroup", () => {
  it("shows at most AVATAR_GROUP_MAX avatars plus a +N count", () => {
    const total = AVATAR_GROUP_MAX + 3;
    const { container } = render(<AgentAvatarGroup agents={agents(total)} />);

    expect(slots(container, "avatar")).toHaveLength(AVATAR_GROUP_MAX);
    const count = slots(container, "avatar-group-count");
    expect(count).toHaveLength(1);
    expect(count[0]).toHaveTextContent("+3");
  });

  it("omits the count when every agent fits inline", () => {
    const { container } = render(
      <AgentAvatarGroup agents={agents(AVATAR_GROUP_MAX)} />,
    );

    expect(slots(container, "avatar")).toHaveLength(AVATAR_GROUP_MAX);
    expect(slots(container, "avatar-group-count")).toHaveLength(0);
  });

  it("renders no avatars without agents", () => {
    const { container } = render(<AgentAvatarGroup agents={[]} />);

    expect(slots(container, "avatar")).toHaveLength(0);
    expect(slots(container, "avatar-group-count")).toHaveLength(0);
  });

  it("keeps every avatar a direct child of the group so the overlap ring applies", () => {
    const { container } = render(<AgentAvatarGroup agents={agents(2)} />);

    const group = container.querySelector('[data-slot="avatar-group"]');
    expect(group).not.toBeNull();
    // AvatarGroup styles its children through the data-slot selector, so a
    // wrapper element around an avatar would silently drop the ring.
    expect(
      Array.from(group!.children).map((child) => child.getAttribute("data-slot")),
    ).toEqual(["avatar", "avatar"]);
  });

  it("marks each avatar's link state with a status badge", () => {
    const { container } = render(
      <AgentAvatarGroup
        agents={[
          agent({ name: "codex", display: "Codex", linked: true }),
          agent({ name: "goose", display: "Goose", internalSkills: ["pdf"] }),
          agent({ name: "windsurf", display: "Windsurf", canonical: true }),
          agent({ name: "cursor", display: "Cursor" }),
        ]}
      />,
    );

    // Badges follow avatar order: linked, content waiting (amber), canonical
    // (counts as linked), plain unlinked (muted).
    expect(slots(container, "avatar-badge").map((badge) => badge.className)).toEqual([
      expect.stringContaining("bg-emerald-500"),
      expect.stringContaining("bg-amber-500"),
      expect.stringContaining("bg-emerald-500"),
      expect.stringContaining("bg-muted-foreground"),
    ]);
  });
});
