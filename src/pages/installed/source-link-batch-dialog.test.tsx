import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithRouter } from "../../test/test-utils";
import {
  SourceLinkBatchDialog,
} from "./source-link-batch-dialog";
import type { LinkableSkill } from "./source-link-banner";

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
          profile: { domain: ["document"] },
        },
        similarity: 0.8,
      },
      {
        skill: {
          name: "docx",
          repo: "fork/docx-tools",
          description: "Forked docx tool.",
          stars: 120,
          downloads: 10,
        },
        similarity: 0.5,
      },
    ],
    recommendedCandidate: {
      skill: {
        name: "docx",
        repo: "nexu-io/open-design",
        description: "Word docx manipulation tool.",
        stars: 98000,
        downloads: 1000,
        profile: { domain: ["document"] },
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

describe("SourceLinkBatchDialog", () => {
  it("renders skills list, select all, and recommended repos", () => {
    renderWithRouter(
      <SourceLinkBatchDialog
        open={true}
        onOpenChange={vi.fn()}
        skills={mockSkills}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("关联技能来源")).toBeInTheDocument();
    expect(screen.getByText("全选 (2/2)")).toBeInTheDocument();
    expect(screen.getByText("docx")).toBeInTheDocument();
    expect(screen.getByText("Create and edit Word documents.")).toBeInTheDocument();
    expect(screen.getByText("nexu-io/open-design")).toBeInTheDocument();

    expect(screen.getByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("Read PDF files.")).toBeInTheDocument();
    expect(screen.getByText("anthropics/skills")).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "确认关联 (2)" }),
    ).toBeInTheDocument();
  });

  it("updates count when unchecking an item", async () => {
    const user = userEvent.setup();

    renderWithRouter(
      <SourceLinkBatchDialog
        open={true}
        onOpenChange={vi.fn()}
        skills={mockSkills}
        onConfirm={vi.fn()}
      />,
    );

    // Uncheck docx
    const docxCheckbox = screen.getByRole("checkbox", { name: "docx" });
    await user.click(docxCheckbox);

    expect(screen.getByText("全选 (1/2)")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "确认关联 (1)" }),
    ).toBeInTheDocument();
  });

  it("disables confirm button when all items are unchecked", async () => {
    const user = userEvent.setup();

    renderWithRouter(
      <SourceLinkBatchDialog
        open={true}
        onOpenChange={vi.fn()}
        skills={mockSkills}
        onConfirm={vi.fn()}
      />,
    );

    // Uncheck docx and pdf
    await user.click(screen.getByRole("checkbox", { name: "docx" }));
    await user.click(screen.getByRole("checkbox", { name: "pdf" }));

    const confirmBtn = screen.getByRole("button", { name: "未选择技能" });
    expect(confirmBtn).toBeDisabled();
  });

  it("submits selected items on confirm and calls onOpenChange(false)", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    renderWithRouter(
      <SourceLinkBatchDialog
        open={true}
        onOpenChange={onOpenChange}
        skills={mockSkills}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "确认关联 (2)" }));

    expect(onConfirm).toHaveBeenCalledWith([
      {
        name: "docx",
        repo: "nexu-io/open-design",
        defaultTags: ["document"],
      },
      {
        name: "pdf",
        repo: "anthropics/skills",
        defaultTags: undefined,
      },
    ]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("allows selecting 'keep unlinked' and submits empty repo", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    renderWithRouter(
      <SourceLinkBatchDialog
        open={true}
        onOpenChange={vi.fn()}
        skills={mockSkills}
        onConfirm={onConfirm}
      />,
    );

    // Open dropdown for pdf
    const changeRepoBtns = screen.getAllByTitle("更换来源仓库");
    await user.click(changeRepoBtns[1]);

    const keepUnlinkedItem = await screen.findByText("保持未关联（设为空，不再提醒）");
    await user.click(keepUnlinkedItem);

    await user.click(screen.getByRole("button", { name: "确认关联 (2)" }));

    expect(onConfirm).toHaveBeenCalledWith([
      {
        name: "docx",
        repo: "nexu-io/open-design",
        defaultTags: ["document"],
      },
      {
        name: "pdf",
        repo: "",
        defaultTags: undefined,
      },
    ]);
  });
});
