import { describe, expect, it } from "vitest";

import { createSkillEditorTheme, skillEditorTokenStyles } from "./skill-editor-theme";

describe("createSkillEditorTheme", () => {
  it("produces a non-empty extension set for both modes", () => {
    expect(createSkillEditorTheme(false)).toBeTruthy();
    expect(createSkillEditorTheme(true)).toBeTruthy();
  });

  it("rebuilds the extension when the mode flips", () => {
    // Identity (not deep equality): CodeMirror deduplicates extensions by
    // reference, so a stale light-mode instance must not survive a switch.
    expect(createSkillEditorTheme(true)).not.toBe(createSkillEditorTheme(false));
  });
});

describe("skillEditorTokenStyles", () => {
  it("colors every token from a shadcn CSS variable, never a literal hue", () => {
    // The whole point of the palette: because colors ride `var(--*)`, they
    // resolve through `index.css` per mode and a token can never keep a
    // light-only color on the dark background (the original bug).
    const colored = skillEditorTokenStyles.filter((s) => "color" in s);
    expect(colored).not.toHaveLength(0);
    for (const style of colored) {
      expect(style.color).toMatch(/^var\(--/);
    }
  });
});
