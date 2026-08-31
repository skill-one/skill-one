import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { fetchSkillDetail } from "../../lib/skill-detail-api";
import { openExternal } from "../../lib/open-external";
import type { Skill } from "../../types/skill";
import { Drawer } from "../../components/ui/drawer";
import { SkillDetailPanel } from "./skill-detail-panel";

vi.mock("../../lib/skill-detail-api", () => ({
  fetchSkillDetail: vi.fn(),
}));

vi.mock("../../lib/open-external", () => ({
  openExternal: vi.fn(),
}));

const mockFetchSkillDetail = vi.mocked(fetchSkillDetail);
const mockOpenExternal = vi.mocked(openExternal);

const skill: Skill = {
  name: "pdf",
  repo: "anthropics/skills",
  description: "Read and merge PDF documents.",
  stars: 169600,
  downloads: 2991984,
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

/**
 * The panel renders the content side of a modal Drawer, so the tests mount
 * it inside a stateful open Drawer exactly like the explore page does. The
 * drawer starts open only when a skill is present, mirroring the page's
 * `open = skill != null` wiring.
 */
function DetailDrawer({
  skill,
  onPrev,
  onNext,
}: {
  skill: Skill | null;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const [open, setOpen] = useState(skill != null);
  return (
    <QueryClientProvider client={queryClient}>
      <Drawer direction="right" open={open} onOpenChange={setOpen}>
        <SkillDetailPanel
          skill={skill}
          onPrev={onPrev ?? (() => {})}
          onNext={onNext ?? (() => {})}
        />
      </Drawer>
    </QueryClientProvider>
  );
}

function renderDrawer(
  props: Partial<Parameters<typeof DetailDrawer>[0]> & { skill?: Skill | null },
) {
  return render(<DetailDrawer skill={skill} {...props} />);
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
    renderDrawer({ skill: null });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockFetchSkillDetail).not.toHaveBeenCalled();
  });

  it("shows skill info and the fetched SKILL.md", async () => {
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderDrawer({});

    // Await the async detail content first; the rest renders with it.
    expect(
      await screen.findByText("Use this skill for PDFs."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("anthropics/skills")).toBeInTheDocument();
    expect(screen.getByText("v1.2.0")).toBeInTheDocument();
    expect(screen.getByText("MIT")).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("skills/pdf/SKILL.md")).toBeInTheDocument();
    // Both popularity metrics render in the badge row.
    expect(screen.getByText("3M")).toBeInTheDocument();
    expect(screen.getByText("169.6K")).toBeInTheDocument();
    expect(mockFetchSkillDetail).toHaveBeenCalledWith(
      "anthropics/skills",
      "pdf",
      undefined,
    );
  });

  it("links the source repo to the skill's GitHub directory when known", async () => {
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderDrawer({ skill: { ...skill, path: "skills/pdf" } });

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
    renderDrawer({});

    await screen.findByText("Use this skill for PDFs.");
    expect(
      screen.getByRole("link", { name: /anthropics\/skills/ }),
    ).toHaveAttribute("href", "https://github.com/anthropics/skills");
  });

  it("opens the source link through the system browser on click", async () => {
    const user = userEvent.setup();
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderDrawer({ skill: { ...skill, path: "skills/pdf" } });

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
    renderDrawer({});

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
    renderDrawer({ onPrev, onNext });

    await screen.findByText("Use this skill for PDFs.");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it("closes via clicking the overlay", async () => {
    const user = userEvent.setup();
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderDrawer({});

    await screen.findByText("Use this skill for PDFs.");
    const overlay = document.querySelector('[data-slot="drawer-overlay"]');
    expect(overlay).not.toBeNull();
    await user.click(overlay!);
    await vi.waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("closes via the Escape key", async () => {
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderDrawer({});

    await screen.findByText("Use this skill for PDFs.");
    fireEvent.keyDown(document.body, { key: "Escape" });
    await vi.waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
