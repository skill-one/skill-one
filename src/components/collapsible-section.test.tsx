import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HardDrive } from "lucide-react";

import { expectNoA11yViolations } from "../test/a11y";
import { CollapsibleSection } from "./collapsible-section";

function renderSection(
  props: Partial<Parameters<typeof CollapsibleSection>[0]> = {},
) {
  return render(
    <CollapsibleSection title="今天" count="3 个 skill" {...props}>
      <div>section body</div>
    </CollapsibleSection>,
  );
}

describe("CollapsibleSection", () => {
  it("opens unfolded: the header names the section and holds the count", () => {
    renderSection();

    // The whole header row is the one trigger, open from the first paint.
    const trigger = screen.getByRole("button", { name: /今天/ });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveTextContent("3 个 skill");
    // The section is named for assistive tech (a labelled <section> is a
    // region landmark).
    expect(screen.getByRole("region", { name: "今天" })).toBeInTheDocument();
    // The body is shown, not held back.
    expect(screen.getByText("section body")).toBeVisible();
  });

  it("pins the trigger while its section scrolls past", () => {
    renderSection();
    // The pinning ground is the trigger's wrapper: a square, opaque rectangle
    // (the trigger keeps its rounded hover corners inside it).
    const trigger = screen.getByRole("button", { name: /今天/ });
    expect(trigger.parentElement).toHaveClass(
      "sticky",
      "top-0",
      "z-10",
      "bg-background",
    );
  });

  it("keeps the body 16px below the header and drops the gap when folded", async () => {
    const user = userEvent.setup();
    renderSection();

    // The gap is the panel's top padding on top of the trigger's own padding.
    const panel = screen.getByText("section body").parentElement!;
    expect(panel).toHaveClass("pt-2");

    // Folding unmounts the panel, so its gap leaves with it — a folded header
    // carries no trailing space.
    await user.click(screen.getByRole("button", { name: /今天/ }));
    expect(screen.queryByText("section body")).not.toBeInTheDocument();
  });

  it("folds the body from the header, then unfolds it, keeping the count", async () => {
    const user = userEvent.setup();
    renderSection();

    // The chevron's state class rides the Collapsible root's data-open
    // attribute: down 90° while open, the class present from first paint.
    // Scoped to the trigger that owns it, rather than the whole document.
    const trigger = screen.getByRole("button", { name: /今天/ });
    const chevron = trigger.querySelector("svg");
    expect(chevron).toHaveClass("group-data-[open]/section:rotate-90");

    await user.click(trigger);
    // Folded: the trigger flips its state and the body leaves the view, but
    // the count stays on the header so the folded section states its size.
    expect(screen.getByRole("button", { name: /今天/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    // Base UI unmounts the folded panel rather than hiding it.
    expect(screen.queryByText("section body")).not.toBeInTheDocument();
    expect(screen.getByText("3 个 skill")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /今天/ }));
    expect(screen.getByRole("button", { name: /今天/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("section body")).toBeVisible();
  });

  it("draws the source glyph when the section carries one", () => {
    renderSection({ icon: HardDrive });
    // The glyph is decorative: the title still names the section. (The
    // accessible name carries no whitespace between the title span and the
    // badge.)
    expect(
      screen
        .getByRole("button", { name: /今天\s*3 个 skill/ })
        .querySelector("svg.lucide-hard-drive"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /今天\s*3 个 skill/ }),
    ).toBeInTheDocument();
  });

  it("can start folded", () => {
    renderSection({ defaultOpen: false });
    expect(screen.getByRole("button", { name: /今天/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText("section body")).not.toBeInTheDocument();
  });

  it("follows a fold owned from above", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = renderSection({ open: true, onOpenChange });

    // Controlled: the section shows exactly the state it is handed, and a
    // press reports the change instead of flipping anything itself. (Base UI
    // rides a second, event-details argument along; the page's handler only
    // ever reads the first.)
    await user.click(screen.getByRole("button", { name: /今天/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
    expect(screen.getByRole("button", { name: /今天/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("section body")).toBeVisible();

    // The caller decides when the fold lands — the next render, a page
    // switch's restored view, whatever owns the state.
    rerender(
      <CollapsibleSection title="今天" count="3 个 skill" open={false}>
        <div>section body</div>
      </CollapsibleSection>,
    );
    expect(screen.getByRole("button", { name: /今天/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText("section body")).not.toBeInTheDocument();
  });

  it("reads a fold handed in folded from the first paint", () => {
    renderSection({ open: false });
    expect(screen.getByRole("button", { name: /今天/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText("section body")).not.toBeInTheDocument();
  });

  it("carries no accessibility violation open or folded", async () => {
    // The trigger, the count badge and the decorative glyph all sit in one
    // accessible name, and the icon must not add a second one. Checked in
    // both states because folding unmounts the panel, which is the state a
    // stale landmark or a dangling `aria-controls` would show up in.
    const { container, rerender } = renderSection({ icon: HardDrive });
    await expectNoA11yViolations(container);

    await userEvent.setup().click(screen.getByRole("button", { name: /今天/ }));
    rerender(
      <CollapsibleSection
        title="今天"
        count="3 个 skill"
        icon={HardDrive}
        defaultOpen={false}
      >
        <div>section body</div>
      </CollapsibleSection>,
    );
    await expectNoA11yViolations(container);
  });

  describe("checkable header with hover selection", () => {
    it("renders chevron and accessible checkbox when checkable", () => {
      renderSection({
        checkable: true,
        checked: false,
        selectAriaLabel: "选择分组 今天",
      });

      const checkbox = screen.getByRole("checkbox", { name: "选择分组 今天" });
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).not.toBeChecked();

      const titleTrigger = screen.getByRole("button", { name: /今天/ });
      expect(titleTrigger).toHaveAttribute("aria-expanded", "true");
    });

    it("clicking checkbox calls onCheckChange and does not fold section", async () => {
      const user = userEvent.setup();
      const onCheckChange = vi.fn();
      renderSection({
        checkable: true,
        checked: false,
        onCheckChange,
        selectAriaLabel: "选择分组 今天",
      });

      const checkbox = screen.getByRole("checkbox", { name: "选择分组 今天" });
      await user.click(checkbox);

      expect(onCheckChange).toHaveBeenCalledWith(true);
      // Section body remains visible (was not collapsed)
      expect(screen.getByText("section body")).toBeVisible();
    });

    it("clicking the title button folds the section without triggering onCheckChange", async () => {
      const user = userEvent.setup();
      const onCheckChange = vi.fn();
      renderSection({
        checkable: true,
        checked: false,
        onCheckChange,
      });

      const titleTrigger = screen.getByRole("button", { name: /今天/ });
      await user.click(titleTrigger);

      expect(onCheckChange).not.toHaveBeenCalled();
      expect(screen.queryByText("section body")).not.toBeInTheDocument();
    });

    it("supports indeterminate and checked states without a11y violations", async () => {
      const { container, rerender } = renderSection({
        checkable: true,
        indeterminate: true,
        selectAriaLabel: "选择分组 今天",
      });

      const checkbox = screen.getByRole("checkbox", { name: "选择分组 今天" });
      expect(checkbox).toHaveAttribute("aria-checked", "mixed");
      await expectNoA11yViolations(container);

      rerender(
        <CollapsibleSection
          title="今天"
          count="3 个 skill"
          checkable={true}
          checked={true}
          selectAriaLabel="选择分组 今天"
        >
          <div>section body</div>
        </CollapsibleSection>,
      );

      expect(screen.getByRole("checkbox", { name: "选择分组 今天" })).toBeChecked();
      await expectNoA11yViolations(container);
    });
  });
});
