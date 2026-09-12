import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ExpandableDescription } from "./expandable-description";

const SHORT = "Read and merge PDF documents.";
const LONG = Array.from({ length: 40 }, () => "A long summary.").join(" ");

/** Height of the three-line clamped box, in the stub's arbitrary units. */
const CLAMPED_HEIGHT = 60;

/** Whether the stub box currently hides text below the clamp. */
let overflows = false;

/**
 * jsdom lays every box out at 0×0, which always reads as "the text fits".
 * These overrides stand in for a real, laid-out box: a fixed three-line height
 * whose `scrollHeight` may exceed it. `scrollHeight` and `clientHeight` are the
 * only layout facts the clamp check reads, so nothing else needs faking.
 */
function stubClampedBox() {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => CLAMPED_HEIGHT,
  });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => (overflows ? CLAMPED_HEIGHT * 2 : CLAMPED_HEIGHT),
  });
}

/**
 * The project-wide ResizeObserver stub is a no-op, so this file installs one
 * whose callback the test fires by hand to simulate a resize.
 */
class ControllableResizeObserver {
  static instances: ControllableResizeObserver[] = [];
  constructor(private readonly callback: ResizeObserverCallback) {
    ControllableResizeObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  fire() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

/** Re-runs every live observer's callback, as a layout change would. */
function resize() {
  act(() => {
    for (const observer of ControllableResizeObserver.instances) observer.fire();
  });
}

beforeEach(() => {
  overflows = false;
  stubClampedBox();
  ControllableResizeObserver.instances = [];
  vi.stubGlobal("ResizeObserver", ControllableResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  // Both members are declared read-only, so deleting the overrides needs the
  // widened handle (the same trick src/test/setup.ts uses for its patches).
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  delete proto.clientHeight;
  delete proto.scrollHeight;
});

describe("ExpandableDescription", () => {
  it("renders the whole summary, clamped, without offering a toggle that fits by accident", () => {
    render(<ExpandableDescription text={SHORT} />);

    // The body is force-mounted: the full text is in the DOM even while the
    // clamp hides part of it, so in-page search and assistive tech read it all.
    const paragraph = screen.getByText(SHORT);
    expect(paragraph).toHaveClass("line-clamp-3");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers 展开 once the summary is really clipped", () => {
    overflows = true;
    render(<ExpandableDescription text={LONG} />);

    expect(screen.getByRole("button", { name: "展开" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("expands the same element in place, then collapses it again", async () => {
    const user = userEvent.setup();
    overflows = true;
    render(<ExpandableDescription text={LONG} />);
    const paragraph = screen.getByText(LONG);

    await user.click(screen.getByRole("button", { name: "展开" }));
    // Never re-mounted, only unclamped: focus, selection and scroll survive.
    expect(screen.getByText(LONG)).toBe(paragraph);
    expect(paragraph).not.toHaveClass("line-clamp-3");
    expect(screen.getByRole("button", { name: "收起" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "收起" }));
    expect(paragraph).toHaveClass("line-clamp-3");
    expect(screen.getByRole("button", { name: "展开" })).toBeInTheDocument();
  });

  it("rides the paragraph's last line in both states instead of taking a row", async () => {
    const user = userEvent.setup();
    overflows = true;
    render(<ExpandableDescription text={LONG} />);
    const paragraph = screen.getByText(LONG);

    // Collapsed: still inside the paragraph but taken out of flow and painted
    // over the tail it fades out, so expanding costs no header height.
    const expand = screen.getByRole("button", { name: "展开" });
    expect(paragraph).toContainElement(expand);
    expect(expand).toHaveClass("absolute");
    expect(expand).toHaveClass("from-background");

    // Expanded: nothing is clipped any more, so the same element drops back
    // into the paragraph's flow and continues after its last word — pinning it
    // to the line's right edge would cover the words already there.
    await user.click(expand);
    const collapse = screen.getByRole("button", { name: "收起" });
    expect(expand).toBe(collapse);
    expect(collapse).not.toHaveClass("absolute");
    expect(paragraph).toContainElement(collapse);
  });

  it("re-checks the fit when the box is resized", () => {
    render(<ExpandableDescription text={LONG} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    // A narrower drawer (or a font swap) pushes the text past three lines.
    overflows = true;
    resize();

    expect(screen.getByRole("button", { name: "展开" })).toBeInTheDocument();
  });

  it("starts a different summary collapsed", async () => {
    const user = userEvent.setup();
    overflows = true;
    const { rerender } = render(<ExpandableDescription text={LONG} />);
    await user.click(screen.getByRole("button", { name: "展开" }));

    const next = `${LONG} Another skill.`;
    rerender(<ExpandableDescription text={next} />);

    expect(screen.getByText(next)).toHaveClass("line-clamp-3");
    expect(screen.getByRole("button", { name: "展开" })).toBeInTheDocument();
  });
});
