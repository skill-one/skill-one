import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithRouter } from "../../test/test-utils";
import { SourceLinkBanner, type LinkableSkill } from "./source-link-banner";

const mockSkills: LinkableSkill[] = [
  {
    name: "docx",
    localDescription: "Create and edit Word documents.",
    candidates: [
      {
        skill: {
          name: "docx",
          repo: "nexu-io/open-design",
          description: "Word docx manipulation tool.",
          stars: 98000,
          downloads: 1000,
        },
        similarity: 0.8,
      },
    ],
    recommendedCandidate: {
      skill: {
        name: "docx",
        repo: "nexu-io/open-design",
        description: "Word docx manipulation tool.",
        stars: 98000,
        downloads: 1000,
      },
      similarity: 0.8,
    },
  },
  {
    name: "pdf",
    localDescription: "Read PDF files.",
    candidates: [
      {
        skill: {
          name: "pdf",
          repo: "anthropics/skills",
          description: "Manipulate PDF files.",
          stars: 179000,
          downloads: 5000,
        },
        similarity: 0.7,
      },
    ],
    recommendedCandidate: {
      skill: {
        name: "pdf",
        repo: "anthropics/skills",
        description: "Manipulate PDF files.",
        stars: 179000,
        downloads: 5000,
      },
      similarity: 0.7,
    },
  },
];

describe("SourceLinkBanner", () => {
  it("renders nothing when skill list is empty", () => {
    const { container } = renderWithRouter(
      <SourceLinkBanner
        skills={[]}
        onLinkAll={vi.fn()}
        onOpenReview={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders banner title, count, and skill names", () => {
    renderWithRouter(
      <SourceLinkBanner
        skills={mockSkills}
        onLinkAll={vi.fn()}
        onOpenReview={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("发现 2 个本地技能可关联商店来源")).toBeInTheDocument();
    expect(screen.getByText(/包含 docx, pdf/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "逐项查看..." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "一键关联推荐源 (2)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭提示" })).toBeInTheDocument();
  });

  it("calls onOpenReview when clicking review button", async () => {
    const user = userEvent.setup();
    const onOpenReview = vi.fn();

    renderWithRouter(
      <SourceLinkBanner
        skills={mockSkills}
        onLinkAll={vi.fn()}
        onOpenReview={onOpenReview}
        onDismiss={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "逐项查看..." }));
    expect(onOpenReview).toHaveBeenCalledTimes(1);
  });

  it("calls onLinkAll when clicking one-click link button", async () => {
    const user = userEvent.setup();
    const onLinkAll = vi.fn().mockResolvedValue(undefined);

    renderWithRouter(
      <SourceLinkBanner
        skills={mockSkills}
        onLinkAll={onLinkAll}
        onOpenReview={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "一键关联推荐源 (2)" }));
    expect(onLinkAll).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss when clicking close button", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    renderWithRouter(
      <SourceLinkBanner
        skills={mockSkills}
        onLinkAll={vi.fn()}
        onOpenReview={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    await user.click(screen.getByRole("button", { name: "关闭提示" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
