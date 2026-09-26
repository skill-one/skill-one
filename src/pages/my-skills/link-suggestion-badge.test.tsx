import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, configure } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithRouter } from "../../test/test-utils";
import { LinkSuggestionBadge } from "./link-suggestion-badge";
import type { LinkCandidate } from "../../lib/link-suggestions";

const { recordSkillProvenance, markSkillsChanged } = vi.hoisted(() => ({
  recordSkillProvenance: vi.fn(),
  markSkillsChanged: vi.fn(),
}));
vi.mock("../../lib/provenance", () => ({ recordSkillProvenance }));
vi.mock("../../hooks/use-installed-skills", () => ({ markSkillsChanged }));

configure({ asyncUtilTimeout: 5000 });

const candidates: LinkCandidate[] = [
  {
    skill: {
      name: "pdf",
      repo: "anthropics/skills",
      description: "Convert PDF files to images and text.",
      stars: 12300,
      downloads: 456,
    },
    similarity: 0.85,
  },
  {
    skill: {
      name: "pdf",
      repo: "fork/pdf-skills",
      description: "PDF conversion toolkit.",
      stars: 0,
      downloads: 0,
    },
    similarity: 0.42,
  },
];

type BadgeProps = Parameters<typeof LinkSuggestionBadge>[0];

function renderBadge(props: Partial<BadgeProps> = {}) {
  return renderWithRouter(
    <LinkSuggestionBadge
      name="pdf"
      localDescription="PDF 文档读取与生成。"
      candidates={candidates}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  recordSkillProvenance.mockResolvedValue(undefined);
  markSkillsChanged.mockResolvedValue(undefined);
});

describe("LinkSuggestionBadge — label variant (default)", () => {
  it("merges the local-install text and icon into one trigger", () => {
    renderBadge();

    const trigger = screen.getByRole("button", {
      name: "关联 pdf 的商店来源",
    });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent("本地安装");
    // The label carries the underline-on-hover affordance.
    const label = screen.getByText("本地安装");
    expect(label).toHaveClass("group-hover:underline");
  });

  it("renders a plain statement when no candidate exists", () => {
    renderBadge({ candidates: [] });

    expect(
      screen.queryByRole("button", { name: "关联 pdf 的商店来源" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("本地安装")).toBeInTheDocument();
  });

  it("explains linking in a tooltip on hover", async () => {
    const user = userEvent.setup();
    renderBadge();

    await user.hover(
      screen.getByRole("button", { name: "关联 pdf 的商店来源" }),
    );

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("关联来源，不改动本地文件");
  });

  it("opens a popover on click with local and candidate descriptions", async () => {
    const user = userEvent.setup();
    renderBadge();

    await user.click(
      screen.getByRole("button", { name: "关联 pdf 的商店来源" }),
    );

    // Header identifies which skill is being linked.
    expect(screen.getByText("关联来源")).toBeInTheDocument();
    expect(screen.getByText("为「pdf」选择来源仓库")).toBeInTheDocument();

    // The local description block allows a direct comparison.
    expect(screen.getByText("本地描述")).toBeInTheDocument();
    expect(screen.getByText("PDF 文档读取与生成。")).toBeInTheDocument();

    // Each candidate exposes repo, namesake-skill description and signals.
    const first = screen.getByRole("button", { name: /anthropics\/skills/ });
    expect(first).toHaveTextContent("Convert PDF files to images and text.");
    expect(first).toHaveTextContent("12.3K");
    expect(first).toHaveTextContent("描述相似 85%");

    const second = screen.getByRole("button", { name: /fork\/pdf-skills/ });
    expect(second).toHaveTextContent("PDF conversion toolkit.");
    expect(second).toHaveTextContent("描述相似 42%");
    // No stars entry for a 0-star repo.
    expect(second).not.toHaveTextContent("0");

    // The footnote states the one guarantee.
    expect(screen.getByText("仅记录来源，本地文件不变")).toBeInTheDocument();
  });

  it("hides the local-description block when the skill has no description", async () => {
    const user = userEvent.setup();
    renderBadge({ localDescription: "  " });

    await user.click(
      screen.getByRole("button", { name: "关联 pdf 的商店来源" }),
    );

    expect(screen.queryByText("本地描述")).not.toBeInTheDocument();
  });

  it("records the picked candidate without a hash and closes the popover", async () => {
    const user = userEvent.setup();
    renderBadge();

    await user.click(
      screen.getByRole("button", { name: "关联 pdf 的商店来源" }),
    );
    await user.click(screen.getByRole("button", { name: /anthropics\/skills/ }));

    expect(recordSkillProvenance).toHaveBeenCalledWith(
      "anthropics/skills",
      "pdf",
    );
    expect(markSkillsChanged).toHaveBeenCalledTimes(1);

    // The popover content disappears after the pick.
    await expect(
      screen.findByText("为「pdf」选择来源仓库", undefined, { timeout: 1000 }),
    ).rejects.toThrow();
  });

  it("does not bubble the trigger click to the surrounding card", async () => {
    const user = userEvent.setup();
    const onCardClick = vi.fn();
    renderWithRouter(
      <div onClick={onCardClick}>
        <LinkSuggestionBadge
          name="pdf"
          localDescription="PDF 文档读取与生成。"
          candidates={candidates}
        />
      </div>,
    );

    await user.click(
      screen.getByRole("button", { name: "关联 pdf 的商店来源" }),
    );

    expect(onCardClick).not.toHaveBeenCalled();
  });
});

describe("LinkSuggestionBadge — icon variant", () => {
  it("renders only a muted icon trigger, no visible text", () => {
    renderBadge({ variant: "icon" });

    const trigger = screen.getByRole("button", {
      name: "关联 pdf 的商店来源",
    });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent("");
    expect(screen.queryByText("本地安装")).not.toBeInTheDocument();
  });

  it("renders nothing when no candidate exists", () => {
    const { container } = renderWithRouter(
      <LinkSuggestionBadge
        name="pdf"
        localDescription="x"
        candidates={[]}
        variant="icon"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("opens the same popover on click", async () => {
    const user = userEvent.setup();
    renderBadge({ variant: "icon" });

    await user.click(
      screen.getByRole("button", { name: "关联 pdf 的商店来源" }),
    );

    expect(screen.getByText("为「pdf」选择来源仓库")).toBeInTheDocument();
  });
});
