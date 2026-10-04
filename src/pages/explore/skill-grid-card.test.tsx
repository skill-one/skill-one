import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SkillGridCard } from "./skill-grid-card";
import { TooltipProvider } from "../../components/ui/tooltip";
import { renderWithRouter } from "../../test/test-utils";
import type { SkillView } from "../../lib/skill-view";

const backed: SkillView = {
  name: "pdf",
  repo: "anthropics/skills",
  description: "Read and write PDF files.",
  stars: 169600,
  downloads: 2991984,
};

function renderCard(skill: SkillView, props = {}) {
  return renderWithRouter(
    <TooltipProvider>
      <ul>
        <SkillGridCard skill={skill} onSelect={() => {}} {...props} />
      </ul>
    </TooltipProvider>,
  );
}

describe("SkillGridCard", () => {
  it("states the name and the description on one square", () => {
    renderCard(backed);

    expect(screen.getByRole("button", { name: /pdf/ })).toBeInTheDocument();
    expect(screen.getByText("Read and write PDF files.")).toBeInTheDocument();
  });

  it("opens the detail panel from the square body", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithRouter(
      <TooltipProvider>
        <ul>
          <SkillGridCard skill={backed} onSelect={onSelect} />
        </ul>
      </TooltipProvider>,
    );

    await user.click(screen.getByRole("button", { name: /pdf/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("marks the open square and dims a disabled install", () => {
    const { rerender } = renderCard(backed, { selected: true });

    expect(screen.getByRole("button", { name: /pdf/ })).toHaveClass(
      "border-primary",
    );

    rerender(
      <TooltipProvider>
        <ul>
          <SkillGridCard skill={backed} muted onSelect={() => {}} />
        </ul>
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: /pdf/ })).toHaveClass(
      "opacity-60",
    );
  });

  it("keeps the store install button, and drops it for a discovery domain", () => {
    const { container, unmount } = renderCard(backed);
    expect(container.querySelector("button")).not.toBeNull();
    unmount();

    const domainLive: SkillView = {
      name: "lark-skill-maker",
      repo: "open.feishu.cn",
      description: "",
      stars: 0,
      downloads: 0,
      url: "https://www.skills.sh/open.feishu.cn/lark-skill-maker",
      storeBacked: false,
    };
    const { container: liveContainer } = renderCard(domainLive);
    expect(liveContainer.querySelector("button")).toBeNull();
  });

  it("marks a source-less skill with the third-party glyph, not a borrowed face", () => {
    const local: SkillView = {
      name: "local-tool",
      repo: "",
      description: "On-disk only.",
      stars: 0,
      downloads: 0,
      installedAt: null,
      storeBacked: false,
    };
    const { container, unmount } = renderCard(local);

    // The face's slot is filled by the mark, and it is labelled rather than
    // hidden: no text sits beside it to name it, so the glyph is the statement.
    expect(screen.getByRole("img", { name: "第三方安装" })).toBeInTheDocument();
    expect(container.querySelector("[data-slot='avatar']")).toBeNull();
    // The square no longer repeats the words beside the mark.
    expect(screen.queryByText("第三方安装")).toBeNull();
    unmount();

    // A sourced square keeps the owner's face where the mark would be.
    renderCard(backed);
    expect(screen.queryByRole("img", { name: "第三方安装" })).toBeNull();
    expect(document.querySelector("[data-slot='avatar']")).not.toBeNull();
  });

  it("lets the source slot take over the mark, so no icon trails it", () => {
    const local: SkillView = {
      name: "local-tool",
      repo: "",
      description: "On-disk only.",
      stars: 0,
      downloads: 0,
      installedAt: null,
      storeBacked: false,
    };
    renderCard(local, { extra: <span data-testid="extra">extra</span> });

    // `extra` is the source statement itself when the skill can be linked, so
    // it fills the face's slot rather than riding after it — one mark, not two.
    expect(screen.getByTestId("extra")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "第三方安装" })).toBeNull();
  });

  it("handles multi-selection check and card click toggling", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onCheckChange = vi.fn();

    const { rerender } = renderCard(backed, {
      checkable: true,
      checked: false,
      onSelect,
      onCheckChange,
      selectionMode: false,
    });

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();

    // Clicking checkbox toggles check without opening detail
    await user.click(checkbox);
    expect(onCheckChange).toHaveBeenCalledWith(true);
    expect(onSelect).not.toHaveBeenCalled();

    // When selectionMode is active, clicking card body toggles check
    rerender(
      <TooltipProvider>
        <ul>
          <SkillGridCard
            skill={backed}
            checkable={true}
            checked={true}
            onSelect={onSelect}
            onCheckChange={onCheckChange}
            selectionMode={true}
          />
        </ul>
      </TooltipProvider>,
    );

    await user.click(screen.getByRole("button", { name: /pdf/ }));
    expect(onCheckChange).toHaveBeenCalledWith(false);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
