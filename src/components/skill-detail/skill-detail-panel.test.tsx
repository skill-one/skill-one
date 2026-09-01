import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { fetchSkillDetail } from "../../lib/skill-detail-api";
import { fetchLocalSkillDetail } from "../../lib/local-skills";
import { openExternal } from "../../lib/open-external";
import type { Skill } from "../../types/skill";
import { Drawer } from "../ui/drawer";
import { SkillDetailPanel } from "./skill-detail-panel";

vi.mock("../../lib/skill-detail-api", () => ({
  fetchSkillDetail: vi.fn(),
}));

vi.mock("../../lib/local-skills", () => ({
  fetchLocalSkillDetail: vi.fn(),
}));

vi.mock("../../lib/open-external", () => ({
  openExternal: vi.fn(),
}));

const mockFetchSkillDetail = vi.mocked(fetchSkillDetail);
const mockFetchLocalSkillDetail = vi.mocked(fetchLocalSkillDetail);
const mockOpenExternal = vi.mocked(openExternal);

const skill: Skill = {
  name: "pdf",
  repo: "anthropics/skills",
  description: "Read and merge PDF documents.",
  stars: 169600,
  downloads: 2991984,
  path: "skills/pdf",
};

/** A skill placed manually into the global directory: no repo, disk read. */
const localSkill: Skill = {
  name: "my-tool",
  repo: "",
  description: "",
  stars: 0,
  downloads: 0,
};

/** A registry entry that carries its version identity (the scanned majority). */
const versionedSkill: Skill = {
  ...skill,
  rev: "t1-a4cf6ce14f6d65b3",
  firstSeenAt: "2026-08-12T04:34:54Z",
};

/** How the panel renders `versionedSkill.firstSeenAt` in the host's locale. */
const SEEN_AT_LOCALE = new Date("2026-08-12T04:34:54Z").toLocaleDateString();

const detail = {
  name: "pdf",
  description: "Read and merge PDF documents.",
  license: "MIT",
  version: "1.2.0",
  author: "Anthropic",
  instructions: "Use this skill for PDFs.",
  path: "skills/pdf/SKILL.md",
};

const localDetail = {
  name: "my-tool",
  description: "",
  instructions: "Local skill body.",
  path: "/Users/me/.agents/skills/my-tool/SKILL.md",
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
  mockFetchLocalSkillDetail.mockReset();
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
    // The author-declared frontmatter version is not shown: the registry's own
    // content fingerprint is the version on display.
    expect(screen.queryByText("v1.2.0")).not.toBeInTheDocument();
    // This entry carries no registry identity, so the meta row stays out.
    expect(screen.queryByText(/^版本/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^收录时间/)).not.toBeInTheDocument();
    expect(screen.getByText("MIT")).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("skills/pdf/SKILL.md")).toBeInTheDocument();
    // Both popularity metrics render in the badge row.
    expect(screen.getByText("3M")).toBeInTheDocument();
    expect(screen.getByText("169.6K")).toBeInTheDocument();
    expect(mockFetchSkillDetail).toHaveBeenCalledWith(
      "anthropics/skills",
      "pdf",
      "skills/pdf",
    );
  });

  it("shows the registry version fingerprint and when that version was recorded", async () => {
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderDrawer({ skill: versionedSkill });

    await screen.findByText("Use this skill for PDFs.");
    // Compact form: the fingerprint scheme segment stays out of the row.
    expect(screen.getByText(/^版本/)).toHaveTextContent("#a4cf6ce1");
    expect(screen.getByText(/^收录时间/)).toHaveTextContent(SEEN_AT_LOCALE);
    // The value it abbreviates, and what it means, live in the tooltips.
    expect(screen.getByTitle(/t1-a4cf6ce14f6d65b3/)).toBeInTheDocument();
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

  it("reads the installed copy from disk but keeps the GitHub links when the registry path is gone", async () => {
    mockFetchLocalSkillDetail.mockResolvedValue(detail);
    renderDrawer({ skill: { ...skill, path: undefined } });

    await screen.findByText("Use this skill for PDFs.");
    expect(mockFetchLocalSkillDetail).toHaveBeenCalledWith("pdf");
    expect(mockFetchSkillDetail).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: /anthropics\/skills/ }),
    ).toHaveAttribute("href", "https://github.com/anthropics/skills");
  });

  it("reads pure local skills from disk without store-only header parts", async () => {
    mockFetchLocalSkillDetail.mockResolvedValue(localDetail);
    renderDrawer({ skill: localSkill });

    expect(await screen.findByText("Local skill body.")).toBeInTheDocument();
    expect(mockFetchLocalSkillDetail).toHaveBeenCalledWith("my-tool");
    expect(mockFetchSkillDetail).not.toHaveBeenCalled();
    // No repo → no GitHub links at all, a 本地安装 caption and the Puzzle
    // placeholder avatar, the disk path as plain text, and no stats row.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("本地安装")).toBeInTheDocument();
    expect(screen.getByLabelText("skill 头像")).toBeInTheDocument();
    expect(screen.getByText(localDetail.path)).toBeInTheDocument();
    expect(screen.queryByText("3M")).not.toBeInTheDocument();
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
