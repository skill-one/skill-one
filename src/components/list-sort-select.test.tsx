import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { ListSortSelect } from "./list-sort-select";
import { renderWithRouter } from "../test/test-utils";

/**
 * The switch states the order on screen, so these tests read the trigger's own
 * children: what leads, what trails, and what the library is told about the
 * mark so it can tighten the padding around it.
 */
function renderSort(props: Partial<Parameters<typeof ListSortSelect>[0]> = {}) {
  const onChange = vi.fn();
  renderWithRouter(
    <ListSortSelect sort="installed" onChange={onChange} {...props} />,
  );
  return { onChange };
}

/** The trigger's children in document order, text nodes included. */
function parts(trigger: HTMLElement): ChildNode[] {
  return Array.from(trigger.childNodes);
}

describe("ListSortSelect", () => {
  it("leads with the order on screen and trails the mark that names it", () => {
    renderSort();

    const trigger = screen.getByRole("button", { name: "分组方式" });
    const [first, last] = [parts(trigger)[0], parts(trigger).at(-1)];

    // The value leads, because it is the one thing the reader must always be
    // able to see and the row is read from its leading edge. The mark trails, in
    // the slot a control's affordance takes — the same slot the scope picker
    // puts its chevron in, and the two now read as one family on the row rather
    // than as a labelled button beside a chevronned one.
    expect(first).toHaveProperty("nodeType", Node.TEXT_NODE);
    expect(first?.textContent).toBe("安装时间");
    expect(last?.nodeName).toBe("svg");
  });

  it("tells the library its mark is the trailing one, and keeps it decorative", () => {
    renderSort();

    const trigger = screen.getByRole("button", { name: "分组方式" });
    const mark = parts(trigger).at(-1);

    // `data-icon="inline-end"` is the library's own convention for a control
    // whose glyph stands at the end of its content, and it goes on the *glyph*:
    // the button reads it with `has-data-[icon=inline-end]:pr-1.5`, which matches
    // a descendant and not the button itself. `aria-hidden` keeps the mark out of
    // the accessible name — the order is already the button's own label.
    expect(mark).toHaveAttribute("data-icon", "inline-end");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(trigger).toHaveAccessibleName("分组方式");
  });
});
