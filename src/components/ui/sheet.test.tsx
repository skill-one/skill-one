import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { Sheet, SheetContent, SheetTitle } from "./sheet";

/**
 * The Sheet overlay must use the app-wide modal overlay treatment shared
 * with Dialog and AlertDialog: bg-black/50 with no backdrop blur. That is
 * also the latest upstream shadcn default; the pre-v4 new-york registry
 * this component used to ship with was bg-black/80, which reads darker.
 */
describe("Sheet", () => {
  it("dims the overlay with the shared bg-black/50 treatment and no blur", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Test sheet</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    const overlay = document.querySelector('[class*="bg-black/50"]');
    expect(overlay).not.toBeNull();
    expect(overlay).not.toHaveClass("backdrop-blur-sm");
    expect(document.querySelector('[class*="bg-black/80"]')).toBeNull();
  });
});
