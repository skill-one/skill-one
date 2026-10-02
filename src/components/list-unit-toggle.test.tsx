import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ListUnitToggle } from "./list-unit-toggle";
import { renderWithRouter } from "../test/test-utils";

function renderToggle(
  props: Partial<Parameters<typeof ListUnitToggle>[0]> = {},
) {
  const onChange = vi.fn();
  renderWithRouter(
    <ListUnitToggle unit="skill" onChange={onChange} {...props} />,
  );
  return { onChange };
}

describe("ListUnitToggle", () => {
  it("draws both arrangements and presses the one on screen", () => {
    renderToggle();

    // The pair is the whole control: nothing to open, and the pressed half
    // says which arrangement the list is in.
    expect(screen.getByRole("button", { name: "列表" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "卡片" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("reads as one control, named for what it decides", () => {
    renderToggle();

    expect(screen.getByRole("group", { name: "列表布局" })).toBeInTheDocument();
  });

  it("switches to the other arrangement in one press", async () => {
    const user = userEvent.setup();
    const { onChange } = renderToggle({ unit: "skill" });

    await user.click(screen.getByRole("button", { name: "卡片" }));

    expect(onChange).toHaveBeenCalledWith("repo");
  });

  it("never leaves the list with neither arrangement", async () => {
    const user = userEvent.setup();
    const { onChange } = renderToggle({ unit: "skill" });

    // A shape is chosen, not toggled off: pressing the pressed half is a no-op,
    // so the pair can never end up with nothing pressed.
    await user.click(screen.getByRole("button", { name: "列表" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("takes no press while it stands down", async () => {
    const user = userEvent.setup();
    const { onChange } = renderToggle({ disabled: true });

    await user.click(screen.getByRole("button", { name: "卡片" }));

    expect(onChange).not.toHaveBeenCalled();
  });
});