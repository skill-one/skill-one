import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, configure } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithRouter } from "../../test/test-utils";
import { LinkSuggestionMark } from "./link-suggestion-mark";
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

type MarkProps = Parameters<typeof LinkSuggestionMark>[0];

function renderMark(props: Partial<MarkProps> = {}) {
  return renderWithRouter(
    <LinkSuggestionMark
      name="pdf"
      localDescription="PDF 文档读取与生成。"
      candidates={candidates}
      className="size-4"
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  recordSkillProvenance.mockResolvedValue(undefined);
  markSkillsChanged.mockResolvedValue(undefined);
});

describe("LinkSuggestionMark", () => {
  it("is the mark itself that is pressed — no second icon beside it", () => {
    renderMark();

    // The affordance is the mark: one control in the face's slot, wearing the
    // same box the plain mark does. Nothing rides after it.
    const trigger = screen.getByRole("button", { name: "关联 pdf 的商店来源" });
    expect(trigger).toHaveClass("rounded-full", "border", "size-4");
    expect(trigger).toHaveTextContent("");
    // Pressable, and pressable in its own amber: a hover that greyed the ink
    // would drop the mark back into the crowd it stands out of.
    expect(trigger).toHaveClass("hover:bg-amber-500/20");
    // The trigger is the mark, so it is a control where the plain mark is a
    // graphic — never both at once, and never an icon riding beside it.
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("falls back to the plain mark when there is no candidate to link", () => {
    renderMark({ candidates: [] });

    expect(
      screen.queryByRole("button", { name: "关联 pdf 的商店来源" }),
    ).not.toBeInTheDocument();
    const mark = screen.getByRole("img", { name: "第三方安装" });
    expect(mark).toHaveClass("rounded-full", "border", "size-4");
  });

  it("explains linking in a tooltip on hover, not the plain statement", async () => {
    const user = userEvent.setup();
    renderMark();

    await user.hover(screen.getByRole("button", { name: "关联 pdf 的商店来源" }));

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("关联来源，不改动本地文件");
  });

  it("opens a popover on click with local and candidate descriptions", async () => {
    const user = userEvent.setup();
    renderMark();

    await user.click(screen.getByRole("button", { name: "关联 pdf 的商店来源" }));

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
    renderMark({ localDescription: "  " });

    await user.click(screen.getByRole("button", { name: "关联 pdf 的商店来源" }));

    expect(screen.queryByText("本地描述")).not.toBeInTheDocument();
  });

  it("marks a repo the user already cut, and still offers it", async () => {
    const user = userEvent.setup();
    // A cut keeps its repo among the candidates — re-picking it is the user's
    // own act of re-identification — so the row says which ones they refused
    // instead of presenting them as if they were new.
    renderMark({ cutRepos: ["fork/pdf-skills"] });

    await user.click(screen.getByRole("button", { name: "关联 pdf 的商店来源" }));

    // Exactly one row is marked: the cut one, not the whole list.
    const marked = screen.getAllByTitle("已忽略");
    expect(marked).toHaveLength(1);
    expect(marked[0].closest("button")).toHaveTextContent("fork/pdf-skills");

    // And it is still a pickable candidate, not a disabled row.
    const row = screen.getByRole("button", { name: /fork\/pdf-skills/ });
    await user.click(row);
    expect(recordSkillProvenance).toHaveBeenCalledWith(
      "fork/pdf-skills",
      "pdf",
      "confirm",
    );
  });

  it("records the picked candidate as a confirmed link and closes the popover", async () => {
    const user = userEvent.setup();
    renderMark();

    await user.click(screen.getByRole("button", { name: "关联 pdf 的商店来源" }));
    await user.click(screen.getByRole("button", { name: /anthropics\/skills/ }));

    expect(recordSkillProvenance).toHaveBeenCalledWith(
      "anthropics/skills",
      "pdf",
      "confirm",
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
        <LinkSuggestionMark
          name="pdf"
          localDescription="PDF 文档读取与生成。"
          candidates={candidates}
          className="size-4"
        />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "关联 pdf 的商店来源" }));

    expect(onCardClick).not.toHaveBeenCalled();
  });

  it("renders a labeled interactive pill when labeled is true and candidates exist", () => {
    renderMark({ labeled: true });

    const trigger = screen.getByRole("button", { name: "关联 pdf 的商店来源" });
    expect(trigger).toHaveTextContent("第三方安装");
    expect(trigger).toHaveTextContent("可关联商店来源");
  });

  it("renders a plain labeled span when labeled is true and candidates are empty", () => {
    renderMark({ labeled: true, candidates: [] });

    expect(
      screen.queryByRole("button", { name: "关联 pdf 的商店来源" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("第三方安装")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "第三方安装" })).toBeInTheDocument();
  });
});
