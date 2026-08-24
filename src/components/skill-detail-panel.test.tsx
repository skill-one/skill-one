import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { fetchSkillDetail } from "../lib/skill-detail-api";
import { openExternal } from "../lib/open-external";
import type { Skill } from "../types/skill";
import { SkillDetailPanel } from "./skill-detail-panel";

vi.mock("../lib/skill-detail-api", () => ({
  fetchSkillDetail: vi.fn(),
}));

vi.mock("../lib/open-external", () => ({
  openExternal: vi.fn(),
}));

const mockFetchSkillDetail = vi.mocked(fetchSkillDetail);
const mockOpenExternal = vi.mocked(openExternal);

const skill: Skill = {
  name: "pdf",
  repo: "anthropics/skills",
  description: "Read and merge PDF documents.",
  stars: 169600,
};

const detail = {
  name: "pdf",
  description: "Read and merge PDF documents.",
  license: "MIT",
  version: "1.2.0",
  author: "Anthropic",
  instructions: "Use this skill for PDFs.",
  path: "skills/pdf/SKILL.md",
};

let queryClient: QueryClient;

function renderPanel(props: Partial<Parameters<typeof SkillDetailPanel>[0]>) {
  return render(
    <QueryClientProvider client={queryClient}>
      <SkillDetailPanel
        skill={null}
        onPrev={() => {}}
        onNext={() => {}}
        onClose={() => {}}
        {...props}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  mockFetchSkillDetail.mockReset();
  mockOpenExternal.mockReset();
});

describe("SkillDetailPanel", () => {
  it("renders nothing when no skill is selected", () => {
    renderPanel({});
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(mockFetchSkillDetail).not.toHaveBeenCalled();
  });

  it("shows skill info and the fetched SKILL.md", async () => {
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderPanel({ skill });

    // Await the async detail content first; the rest renders with it.
    expect(
      await screen.findByText("Use this skill for PDFs."),
    ).toBeInTheDocument();
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(screen.getByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("anthropics/skills")).toBeInTheDocument();
    expect(screen.getByText("v1.2.0")).toBeInTheDocument();
    expect(screen.getByText("MIT")).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("skills/pdf/SKILL.md")).toBeInTheDocument();
    expect(mockFetchSkillDetail).toHaveBeenCalledWith(
      "anthropics/skills",
      "pdf",
      undefined,
    );
  });

  it("links the source repo to the skill's GitHub directory when known", async () => {
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderPanel({ skill: { ...skill, path: "skills/pdf" } });

    await screen.findByText("Use this skill for PDFs.");
    expect(
      screen.getByRole("link", { name: /anthropics\/skills/ }),
    ).toHaveAttribute(
      "href",
      "https://github.com/anthropics/skills/tree/HEAD/skills/pdf",
    );
    // The file path links to the exact SKILL.md on GitHub.
    expect(
      screen.getByRole("link", { name: /skills\/pdf\/SKILL\.md/ }),
    ).toHaveAttribute(
      "href",
      "https://github.com/anthropics/skills/blob/HEAD/skills/pdf/SKILL.md",
    );
  });

  it("links the source repo to the GitHub repo root when the path is unknown", async () => {
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderPanel({ skill });

    await screen.findByText("Use this skill for PDFs.");
    expect(
      screen.getByRole("link", { name: /anthropics\/skills/ }),
    ).toHaveAttribute("href", "https://github.com/anthropics/skills");
  });

  it("opens the source link through the system browser on click", async () => {
    const user = userEvent.setup();
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderPanel({ skill: { ...skill, path: "skills/pdf" } });

    await screen.findByText("Use this skill for PDFs.");
    await user.click(screen.getByRole("link", { name: /anthropics\/skills/ }));
    expect(mockOpenExternal).toHaveBeenCalledWith(
      "https://github.com/anthropics/skills/tree/HEAD/skills/pdf",
    );
  });

  it("shows an error state with a retry button when the fetch fails", async () => {
    const user = userEvent.setup();
    mockFetchSkillDetail.mockRejectedValueOnce(
      new Error("SKILL.md for pdf not found"),
    );
    renderPanel({ skill });

    expect(
      await screen.findByText(/SKILL.md for pdf not found/),
    ).toBeInTheDocument();

    mockFetchSkillDetail.mockResolvedValueOnce(detail);
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(
      await screen.findByText("Use this skill for PDFs."),
    ).toBeInTheDocument();
  });

  it("switches skills via delegated arrow-key handlers", async () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderPanel({ skill, onPrev, onNext });

    await screen.findByText("Use this skill for PDFs.");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it("closes via the X button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderPanel({ skill, onClose });

    await screen.findByText("Use this skill for PDFs.");
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via the Escape key", async () => {
    const onClose = vi.fn();
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderPanel({ skill, onClose });

    await screen.findByText("Use this skill for PDFs.");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
