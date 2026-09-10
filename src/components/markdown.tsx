import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { openExternal } from "../lib/open-external";
import { githubBlobUrl } from "../lib/cdn-config";

/** URL schemes handed to the system browser; anything else stays inert. */
const EXTERNAL_SCHEME = /^(https?|mailto):/;

interface MarkdownProps {
  /** Raw markdown source, rendered with GitHub-flavored extensions. */
  children: string;
  /** Repo slug ("owner/name") the source file lives in. */
  repo?: string;
  /** Git ref the source file is viewed at; defaults to the branch head. */
  gitRef?: string;
  /** Path of the source file inside the repo; enables relative-URL resolution. */
  filePath?: string;
}

/**
 * Resolve a relative markdown URL against GitHub's view of the source file:
 * links point to the blob page, images to raw.githubusercontent, so references
 * inside a SKILL.md work like on github.com. Absolute and anchor URLs pass
 * through unchanged.
 */
function resolveUrl(
  url: string,
  kind: "blob" | "raw",
  repo: string,
  filePath: string,
  gitRef: string,
): string {
  if (EXTERNAL_SCHEME.test(url) || url.startsWith("#")) return url;
  const base =
    kind === "blob"
      ? githubBlobUrl(repo, filePath, gitRef)
      : `https://raw.githubusercontent.com/${repo}/${gitRef}/${filePath}`;
  return new URL(url, base).toString();
}

/**
 * Render untrusted markdown (remote SKILL.md files) as styled prose.
 * Raw HTML in the source is ignored and unsafe link URLs are stripped
 * by react-markdown defaults, so no sanitizer is needed.
 */
export function Markdown({ children, repo, gitRef = "HEAD", filePath }: MarkdownProps) {
  const components: Components = {
    // Links must never navigate the Tauri WebView itself; only external
    // schemes are handed to the system browser.
    a: ({ href, children: linkChildren }) => {
      const resolved =
        href && repo && filePath
          ? resolveUrl(href, "blob", repo, filePath, gitRef)
          : href;
      return (
        <a
          href={resolved}
          onClick={(e) => {
            e.preventDefault();
            if (resolved && EXTERNAL_SCHEME.test(resolved)) {
              void openExternal(resolved);
            }
          }}
        >
          {linkChildren}
        </a>
      );
    },
    img: ({ src, alt }) => (
      <img
        src={
          src && repo && filePath
            ? resolveUrl(src, "raw", repo, filePath, gitRef)
            : src
        }
        alt={alt}
        loading="lazy"
      />
    ),
  };

  return (
    // Base prose (16px), not prose-sm: the detail panel reads at document
    // width (600-700px ≈ 75ch), where the 13-14px prose-sm would force
    // ~90-character lines. Headings scale with it, so long SKILL.md files
    // keep a visible hierarchy.
    <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
