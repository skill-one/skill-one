import { createTheme } from "@uiw/codemirror-themes";
import { tags as t } from "@lezer/highlight";

/**
 * Markdown token colors, keyed off the shadcn CSS variables instead of literal
 * hues. Because `index.css` redefines the variables under `.dark`, one palette
 * serves both modes — a token can never end up tuned for the wrong background.
 *
 * The palette here is deliberately restrained (the app's base colors are
 * grayscale): headings and strong text carry weight, structural markers and
 * frontmatter recede into `--muted-foreground`, links take `--primary`.
 */
export const skillEditorTokenStyles = [
  { tag: t.heading, fontWeight: "600" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "var(--primary)", textDecoration: "underline" },
  { tag: t.url, color: "var(--muted-foreground)" },
  { tag: t.monospace, color: "var(--muted-foreground)" },
  { tag: t.quote, color: "var(--muted-foreground)", fontStyle: "italic" },
  // Markdown structural marks (#, **, fences) and frontmatter.
  { tag: t.processingInstruction, color: "var(--muted-foreground)" },
  { tag: t.meta, color: "var(--muted-foreground)" },
  { tag: t.contentSeparator, color: "var(--muted-foreground)" },
];

/**
 * The color theme for the SKILL.md editor, built on `@uiw/codemirror-themes`.
 * Returns an extension list combining an `EditorView.theme` (surface, caret,
 * selection, active line) with a `syntaxHighlighting` style over the tokens
 * above. `dark` only sets CodeMirror's theme flag — the colors themselves
 * track the app through CSS variables — but the flag still differs per mode,
 * so the extension must be rebuilt when the mode flips.
 */
export function createSkillEditorTheme(dark: boolean) {
  return createTheme({
    theme: dark ? "dark" : "light",
    settings: {
      background: "transparent",
      foreground: "var(--foreground)",
      caret: "var(--foreground)",
      selection: "var(--muted)",
      selectionMatch: "var(--accent)",
      lineHighlight: "var(--muted)",
      fontFamily:
        "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
      fontSize: "13px",
    },
    styles: skillEditorTokenStyles,
  });
}
