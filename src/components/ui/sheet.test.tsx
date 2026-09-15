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
});
