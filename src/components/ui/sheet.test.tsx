import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { Sheet, SheetContent, SheetTitle } from "./sheet";

/**
 * The Sheet overlay must use the app-wide modal overlay treatment shared
 * with Dialog and AlertDialog: bg-black/50 plus backdrop-blur-sm. The
 * upstream shadcn (new-york) default this component is generated from is
 * bg-black/80, which reads much darker next to the app's dialogs.
 */
describe("Sheet", () => {
  it("dims the overlay like Dialog instead of the darker upstream default", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Test sheet</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    const overlay = document.querySelector('[class*="bg-black/50"]');
    expect(overlay).not.toBeNull();
    expect(overlay).toHaveClass("backdrop-blur-sm");
    expect(document.querySelector('[class*="bg-black/80"]')).toBeNull();
  });
});
