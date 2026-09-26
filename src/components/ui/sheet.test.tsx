import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { Sheet, SheetContent, SheetTitle } from "./sheet";

/**
 * The overlay uses the upstream shadcn Base UI default as-is: a light
 * bg-black/10 dim with a backdrop blur where supported. The pre-migration
 * app carried a customized bg-black/50 no-blur treatment; per the "prefer
 * upstream defaults" policy that customization was dropped.
 */
describe("Sheet", () => {
  it("renders the default Base UI overlay treatment", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Test sheet</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    const overlay = document.querySelector('[data-slot="sheet-overlay"]');
    expect(overlay).not.toBeNull();
    expect(overlay).toHaveClass("bg-black/10");
    expect(overlay).toHaveClass("supports-backdrop-filter:backdrop-blur-xs");
  });

  /**
   * The sheet hangs from the header's bottom edge, not the window's top: the
   * dimmed overlay and the vertical popup both start at `top-header` so the
   * app's chrome row stays visible (and unblurred) under a modal sheet.
   * `h-full` must go with it — the popup is stretched by `top` + `bottom`
   * instead, and a leftover full height would run it under the header again.
   */
  it("clears the app header at the top", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Test sheet</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    const overlay = document.querySelector('[data-slot="sheet-overlay"]');
    expect(overlay).toHaveClass("top-header");
    expect(overlay).not.toHaveClass("inset-0");

    const content = document.querySelector('[data-slot="sheet-content"]');
    expect(content).toHaveAttribute("data-side", "right");
    expect(content).toHaveClass("data-[side=right]:top-header");
    expect(content).toHaveClass("data-[side=right]:bottom-0");
    expect(content).not.toHaveClass("data-[side=right]:h-full");
    expect(content).not.toHaveClass("data-[side=right]:inset-y-0");
  });
});
