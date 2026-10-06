import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LinkCandidatePopover } from "./link-candidate-popover";

describe("LinkCandidatePopover", () => {
  it("allows entering a manual repository and submitting", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();

    render(
      <LinkCandidatePopover
        name="dingtalk-misc"
        candidates={[]}
        emptyLabel="没有其他来源"
        pendingRepo={null}
        onPick={onPick}
      />,
    );

    expect(screen.getByText("没有其他来源")).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/owner\/repo/i);
    const submitBtn = screen.getByRole("button", { name: "关联" });

    // Disabled initially
    expect(submitBtn).toBeDisabled();

    // Type valid repo
    await user.type(input, "alibaba/dingtalk-misc");
    expect(submitBtn).toBeEnabled();

    await user.click(submitBtn);
    expect(onPick).toHaveBeenCalledWith("alibaba/dingtalk-misc", undefined);
  });

  it("normalizes full github URLs when submitting manual repository", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();

    render(
      <LinkCandidatePopover
        name="custom-skill"
        candidates={[]}
        emptyLabel="没有其他来源"
        pendingRepo={null}
        onPick={onPick}
      />,
    );

    const input = screen.getByPlaceholderText(/owner\/repo/i);
    await user.type(input, "https://github.com/my-org/my-skill.git");

    const submitBtn = screen.getByRole("button", { name: "关联" });
    await user.click(submitBtn);

    expect(onPick).toHaveBeenCalledWith("my-org/my-skill", undefined);
  });
});
