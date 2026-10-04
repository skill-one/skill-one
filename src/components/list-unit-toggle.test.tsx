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

  it("wears the segmented look: a muted track with the pressed half raised", () => {
    renderToggle();

    const track = screen.getByRole("group", { name: "列表布局" });
    const pressed = screen.getByRole("button", { name: "列表" });
    const idle = screen.getByRole("button", { name: "卡片" });

    // The same recipe the header's destinations wear (see `segmented`), and the
    // reason the two controls read as one family. The track is the muted bed and
    // the pressed half is raised out of it — the library's own toggle shades it
    // with `bg-muted`, which is also what an unpressed half darkens *to* on
    // hover, so pressed and hovered were one and the same shade and the reader
    // had nothing to tell them by. `hover:bg-transparent` is half of the fix and
    // the raised fill is the other half.
    expect(track).toHaveClass("bg-muted");
    expect(pressed).toHaveClass("aria-pressed:bg-background");
    expect(pressed).toHaveClass("aria-pressed:shadow-sm");
    expect(pressed).toHaveClass("aria-pressed:text-foreground");
    expect(pressed).not.toHaveClass("aria-pressed:bg-muted");
    expect(idle).toHaveClass("hover:bg-transparent");
    expect(idle).toHaveClass("text-foreground/60");
    // Both halves carry the same recipe, because the raised look is a state the
    // library writes onto the element rather than a class a parent knows about:
    // `aria-pressed` is what decides which half is raised, and only the pressed
    // one carries it. It is also the library's own pressed shade, so the recipe
    // has to beat `aria-pressed:bg-muted` rather than merely sit beside it.
    expect(pressed).toHaveAttribute("aria-pressed", "true");
    expect(idle).toHaveAttribute("aria-pressed", "false");
    // The track's own 2px gap replaces the library's `--spacing()` gap rather
    // than adding to it, so the halves cannot drift apart by a variable that
    // only exists in someone else's arithmetic.
    expect(track).toHaveClass("gap-0.5");
    expect(track).not.toHaveClass("gap-[--spacing(var(--gap))]");
  });

  it("joins its halves to a track rather than a run of outline buttons", () => {
    renderToggle();

    // `variant="outline"` drew a border round every half, borders included, on a
    // pair that stands inside a track — so the unpressed halves were the
    // outlined things on screen and the pressed one was a grey smudge between
    // them. The track says "one control"; the halves only fill it.
    for (const name of ["列表", "卡片"]) {
      expect(screen.getByRole("button", { name })).not.toHaveClass("border");
      expect(screen.getByRole("button", { name })).not.toHaveClass(
        "border-input",
      );
    }
  });

  it("stands as tall as the field it sits beside", () => {
    renderToggle();

    // A 28px half in a 3px-padded track would be 34px and make this switch the
    // tallest thing on a row whose field is `h-8`; the shared track's 2px padding
    // holds the whole control at the field's own 32px.
    expect(screen.getByRole("group", { name: "列表布局" })).toHaveClass("p-0.5");
    expect(screen.getByRole("button", { name: "列表" })).toHaveClass("h-7");
  });
});