import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { openExternal } from "../lib/open-external";
import { Markdown } from "./markdown";

vi.mock("../lib/open-external", () => ({
  openExternal: vi.fn(),
}));

const mockOpenExternal = vi.mocked(openExternal);

beforeEach(() => {
  mockOpenExternal.mockReset();
});

describe("Markdown", () => {
  it("renders headings, emphasis and paragraphs", () => {
    render(<Markdown>{"# Title\n\nSome **bold** text."}</Markdown>);
    expect(
      screen.getByRole("heading", { level: 1, name: "Title" }),
    ).toBeInTheDocument();
    expect(screen.getByText("bold").tagName).toBe("STRONG");
  });

  it("renders GFM tables", () => {
    render(<Markdown>{"| a | b |\n| - | - |\n| 1 | 2 |"}</Markdown>);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "a" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1" })).toBeInTheDocument();
  });

  it("renders GFM task lists as checkboxes", () => {
    render(<Markdown>{"- [x] done\n- [ ] todo"}</Markdown>);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toBeChecked();
    expect(boxes[1]).not.toBeChecked();
  });

  it("renders fenced code blocks as preformatted text", () => {
    render(<Markdown>{"```bash\nnpm install foo\n```"}</Markdown>);
    const code = screen.getByText(/npm install foo/);
    expect(code.closest("pre")).toBeInTheDocument();
  });

  it("does not render raw HTML from untrusted sources", () => {
    const { container } = render(
      <Markdown>{"before<script>window.__pwned = true</script>after"}</Markdown>,
    );
    expect(container.querySelector("script")).toBeNull();
    expect((window as { __pwned?: boolean }).__pwned).toBeUndefined();
    expect(screen.getByText(/before/)).toBeInTheDocument();
  });

  it("strips javascript: link URLs", () => {
    render(<Markdown>{"[click me](javascript:alert(1))"}</Markdown>);
    // defaultUrlTransform replaces unsafe URLs with an empty string, which
    // also removes the accessible "link" role.
    const link = screen.getByText("click me");
    expect(link.getAttribute("href")).toBe("");
  });

  it("opens absolute links through the system browser", async () => {
    const user = userEvent.setup();
    render(<Markdown>{"[docs](https://example.com/guide)"}</Markdown>);
    await user.click(screen.getByRole("link", { name: "docs" }));
    expect(mockOpenExternal).toHaveBeenCalledWith("https://example.com/guide");
  });

  it("opens mailto links through the system browser", async () => {
    const user = userEvent.setup();
    render(<Markdown>{"[mail me](mailto:a@example.com)"}</Markdown>);
    await user.click(screen.getByRole("link", { name: "mail me" }));
    expect(mockOpenExternal).toHaveBeenCalledWith("mailto:a@example.com");
  });

  it("never hands relative links to the system browser", async () => {
    const user = userEvent.setup();
    render(<Markdown>{"[file](./other.md)"}</Markdown>);
    await user.click(screen.getByRole("link", { name: "file" }));
    expect(mockOpenExternal).not.toHaveBeenCalled();
  });

  it("resolves relative links to GitHub blob pages", async () => {
    const user = userEvent.setup();
    render(
      <Markdown repo="o/r" filePath="skills/pdf/SKILL.md">
        {"[license](./LICENSE.md)"}
      </Markdown>,
    );
    const link = screen.getByRole("link", { name: "license" });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/o/r/blob/HEAD/skills/pdf/LICENSE.md",
    );
    await user.click(link);
    expect(mockOpenExternal).toHaveBeenCalledWith(
      "https://github.com/o/r/blob/HEAD/skills/pdf/LICENSE.md",
    );
  });

  it("resolves relative image sources to raw.githubusercontent", () => {
    render(
      <Markdown repo="o/r" filePath="skills/pdf/SKILL.md">
        {"![logo](assets/logo.png)"}
      </Markdown>,
    );
    expect(screen.getByRole("img", { name: "logo" })).toHaveAttribute(
      "src",
      "https://raw.githubusercontent.com/o/r/HEAD/skills/pdf/assets/logo.png",
    );
  });

  it("leaves absolute image sources untouched", () => {
    render(
      <Markdown repo="o/r" filePath="skills/pdf/SKILL.md">
        {"![x](https://example.com/x.png)"}
      </Markdown>,
    );
    expect(screen.getByRole("img", { name: "x" })).toHaveAttribute(
      "src",
      "https://example.com/x.png",
    );
  });
});
