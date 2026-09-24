import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { useTheme } from "next-themes";

import { cn } from "cn";

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
 * Theming rides the existing shadcn CSS variables instead of a bundled theme
 * package, so light/dark follow the app's `next-themes` mode for free. The
 * feature set is trimmed to what editing markdown needs — highlighting,
 * history and search — with line numbers, folding and completion switched off.
 */
export function SkillEditor({ value, onChange, className }: SkillEditorProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  const theme = useMemo(
    () =>
      EditorView.theme(
        {
          "&": {
            backgroundColor: "transparent",
            color: "var(--foreground)",
            fontSize: "13px",
          },
          ".cm-content": {
            fontFamily:
              "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
            padding: "12px 0",
          },
          ".cm-scroller": { lineHeight: "1.7" },
          ".cm-activeLine": { backgroundColor: "var(--muted)" },
          ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
          "&.cm-focused": { outline: "none" },
        },
        { dark },
      ),
    [dark],
  );

  const extensions = useMemo(() => [markdown(), theme], [theme]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      height="100%"
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
