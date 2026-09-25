import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTheme } from "next-themes";

import { SkillEditor } from "./skill-editor";
import { createSkillEditorTheme } from "./skill-editor-theme";

// Spy on the theme factory while keeping the real implementation, so
// assertions target the wiring (mode -> theme) without introspecting
// CodeMirror extension objects.
vi.mock("./skill-editor-theme", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./skill-editor-theme")>();
  return { ...mod, createSkillEditorTheme: vi.fn(mod.createSkillEditorTheme) };
});

// Capture the props handed to the CodeMirror wrapper instead of mounting the
// real widget: the regression under test lives in the props, not the DOM.
const codeMirrorProps: Array<Record<string, unknown>> = [];
vi.mock("@uiw/react-codemirror", () => ({
  default: (props: Record<string, unknown>) => {
    codeMirrorProps.push(props);
    return <div data-testid="codemirror-stub" />;
  },
}));

vi.mock("next-themes", () => ({
  useTheme: vi.fn(),
}));

const mockUseTheme = vi.mocked(useTheme);
const mockCreateTheme = vi.mocked(createSkillEditorTheme);

// The component only reads `resolvedTheme`; the cast skips next-themes'
// unused bookkeeping fields.
const themeState = (resolvedTheme: string) =>
  ({ resolvedTheme, setTheme: vi.fn() }) as unknown as ReturnType<
    typeof useTheme
  >;

beforeEach(() => {
  codeMirrorProps.length = 0;
  mockCreateTheme.mockClear();
});

describe("SkillEditor", () => {
  it("opts out of the wrapper's built-in light surface", () => {
    // The wrapper's `theme` default is "light", which paints a hard #fff
    // background over the dark palette — the dark-mode breakage reported
    // here. The surface must come solely from our CSS-variable theme.
    mockUseTheme.mockReturnValue(themeState("dark"));
    render(<SkillEditor value="# demo" onChange={vi.fn()} />);

    expect(codeMirrorProps[0]?.theme).toBe("none");
    expect(mockCreateTheme).toHaveBeenCalledWith(true);
  });

  it("rebuilds the theme when the resolved mode flips", () => {
    mockUseTheme.mockReturnValue(themeState("light"));

    const { rerender } = render(<SkillEditor value="# demo" onChange={vi.fn()} />);
    expect(mockCreateTheme).toHaveBeenCalledWith(false);
    const lightExtensions = codeMirrorProps[0]?.extensions;

    mockUseTheme.mockReturnValue(themeState("dark"));
    rerender(<SkillEditor value="# demo" onChange={vi.fn()} />);

    expect(mockCreateTheme).toHaveBeenCalledWith(true);
    expect(mockCreateTheme).toHaveBeenCalledTimes(2);
    // CodeMirror deduplicates extensions by reference: a stale light-mode
    // instance must not survive the switch.
    expect(codeMirrorProps[1]?.extensions).not.toBe(lightExtensions);
  });
});
