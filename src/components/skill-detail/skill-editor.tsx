import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { useTheme } from "next-themes";

import { cn } from "cn";

import { createSkillEditorTheme } from "./skill-editor-theme";

interface SkillEditorProps {
  /** Raw SKILL.md source (frontmatter included). */
  value: string;
  /** Fires on every edit with the full document text. */
  onChange: (value: string) => void;
  className?: string;
}

/**
 * The in-place SKILL.md editor: a CodeMirror 6 view dressed in the app's own
 * type and palette. Loaded lazily by the detail panel (`LazySkillEditor`), so
 * the CodeMirror chunk only rides in once a skill is actually opened for
 * editing — the boot cost of a read-only viewer is unchanged.
 *
 * Colors come from `createSkillEditorTheme`, which derives both the surface
 * and the markdown token palette from the shadcn CSS variables, so light/dark
 * follow the app's `next-themes` mode. Only layout rules that the theme
 * factory doesn't cover (content padding, line height) stay here.
 */
export function SkillEditor({ value, onChange, className }: SkillEditorProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  const theme = useMemo(() => createSkillEditorTheme(dark), [dark]);

  const layout = useMemo(
    () =>
      EditorView.theme({
        ".cm-content": { padding: "12px 0" },
        ".cm-scroller": { lineHeight: "1.7" },
        "&.cm-focused": { outline: "none" },
      }),
    [],
  );

  const extensions = useMemo(
    () => [markdown(), theme, layout],
    [theme, layout],
  );

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      height="100%"
      // "none" opts out of the wrapper's built-in light surface (a hard
      // `#fff` background) — the surface colors come solely from
      // `createSkillEditorTheme`, so dark mode keeps a dark editor.
      theme="none"
      className={cn("h-full text-[13px]", className)}
      extensions={extensions}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLineGutter: false,
        highlightActiveLine: true,
        autocompletion: false,
        bracketMatching: false,
        closeBrackets: false,
      }}
    />
  );
}
