import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { fetchSkillDetail } from "../../lib/skill-detail-api";
import { fetchSkillProfile } from "../../lib/skill-profile-api";
import {
  fetchInstalledSkills,
  fetchLocalSkillDetail,
  removeInstalledSkill,
  setSkillEnabled,
} from "../../lib/local-skills";
import { openExternal } from "../../lib/open-external";
import type { Skill } from "../../types/skill";
import { Drawer } from "../ui/drawer";
import {
  SkillDetailPanel,
  type SkillDetailSurface,
} from "./skill-detail-panel";

vi.mock("../../lib/skill-detail-api", () => ({
  MIRROR: { repo: "skill-one/skills-sh-mirror", ref: "dist" },
  fetchSkillDetail: vi.fn(),
}));

vi.mock("../../lib/skill-profile-api", () => ({
  fetchSkillProfile: vi.fn(),
  // The cover is a pure URL builder; the header uses it to address the
  // skill's image. Nothing loads in this env, so the slot shows its fallback.
  skillCoverCandidates: (id: string) => [`https://cdn.test/${id}/cover.png`],
}));

vi.mock("../../lib/local-skills", () => ({
  fetchLocalSkillDetail: vi.fn(),
  fetchInstalledSkills: vi.fn(),
  removeInstalledSkill: vi.fn(),
  setSkillEnabled: vi.fn(),
}));

vi.mock("../../lib/open-external", () => ({
  openExternal: vi.fn(),
}));

const mockFetchSkillDetail = vi.mocked(fetchSkillDetail);
const mockFetchSkillProfile = vi.mocked(fetchSkillProfile);
const mockFetchLocalSkillDetail = vi.mocked(fetchLocalSkillDetail);
const mockRemoveInstalledSkill = vi.mocked(removeInstalledSkill);
const mockSetSkillEnabled = vi.mocked(setSkillEnabled);
const mockOpenExternal = vi.mocked(openExternal);

/** One entry of the installed list, as the backend reports it. */
const installedPdf = {
  name: "pdf",
  path: "/Users/me/.agents/skills/pdf",
  enabled: true,
};

const skill: Skill = {
  name: "pdf",
  repo: "anthropics/skills",
  description: "Read and merge PDF documents.",
  stars: 169600,
  downloads: 2991984,
  path: "skills/anthropics/skills/pdf",
  url: "https://www.skills.sh/anthropics/skills/pdf",
};

/** A skill placed manually into the global directory: no repo, disk read. */
const localSkill: Skill = {
  name: "my-tool",
  repo: "",
  description: "",
  stars: 0,
  downloads: 0,
};

/** A registry entry that carries its version identity (the indexed majority). */
const versionedSkill: Skill = {
  ...skill,
  rev: "b146008599c31057cef1c145774cea5d5afb30e8f43fa802e47a4b461419aaaf",
  firstSeenAt: "2026-08-12T04:34:54Z",
};

/** How the panel renders `versionedSkill.firstSeenAt` in the host's locale. */
const SEEN_AT_LOCALE = new Date("2026-08-12T04:34:54Z").toLocaleDateString();

const detail = {
  name: "pdf",
  description: "Read and merge PDF documents.",
  license: "MIT",
  author: "Anthropic",
  instructions: "Use this skill for PDFs.",
  path: "skills/anthropics/skills/pdf/SKILL.md",
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
  skill: currentSkill,
  surface,
  onPrev,
  onNext,
}: {
  skill: Skill | null;
  surface?: SkillDetailSurface;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const [open, setOpen] = useState(currentSkill != null);
  return (
    <QueryClientProvider client={queryClient}>
      <Drawer direction="right" open={open} onOpenChange={setOpen}>
        <SkillDetailPanel
          skill={currentSkill}
          surface={surface}
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
  mockFetchSkillProfile.mockReset();
  mockFetchLocalSkillDetail.mockReset();
  mockSetSkillEnabled.mockReset();
  mockOpenExternal.mockReset();
  mockFetchSkillDetail.mockResolvedValue(detail);
  // The header install button reads the installed list; nothing is
  // installed unless a test says otherwise.
  vi.mocked(fetchInstalledSkills).mockResolvedValue([]);
});

describe("SkillDetailPanel", () => {
  it("renders nothing when no skill is selected", () => {
    renderDrawer({ skill: null });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockFetchSkillDetail).not.toHaveBeenCalled();
  });

  it("shows skill info and the fetched SKILL.md", async () => {
    const user = userEvent.setup();
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderDrawer({});

    // Await the async detail content first; the rest renders with it.
    expect(
      await screen.findByText("Use this skill for PDFs."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // The header leads with the skill's own image, not the author's avatar.
    expect(screen.getByRole("img", { name: "pdf 封面图" })).toHaveAttribute(
      "data-slot",
      "skill-cover",
    );
    expect(screen.getByText("pdf")).toBeInTheDocument();
    // The author's avatar rides the repo line: who published the skill, next
    // to where it lives. It is decoration, so it never joins the link's name.
    expect(
      screen
        .getByRole("link", { name: "anthropics/skills" })
        .querySelector('[data-slot="avatar"]'),
    ).not.toBeNull();
    expect(screen.getByText("anthropics/skills")).toBeInTheDocument();
    expect(screen.getByText("MIT")).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    // One blended popularity figure, exactly like the list rows: the source
    // counts stay hidden until the figure is hovered.
    expect(
      screen.getByRole("button", {
        name: "热度 712.4K：安装 3M · Star 169.6K",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("712.4K")).toBeInTheDocument();
    expect(screen.queryByText("3M")).not.toBeInTheDocument();
    expect(screen.queryByText("169.6K")).not.toBeInTheDocument();
    // Keyboard focus opens the same breakdown (also the a11y path).
    const heat = screen.getByRole("button", { name: /^热度 / });
    heat.focus();
    const heatTip = await screen.findByRole("tooltip");
    expect(heatTip.textContent).toMatch(/3M\s*·\s*169\.6K/);
    heat.blur();
    // The exact path is provenance detail: hidden behind the 源 tip by
    // default, and an unhashed entry's tip carries no version lines at all.
    expect(screen.queryByText(detail.path)).not.toBeInTheDocument();
    await user.hover(screen.getByRole("link", { name: "源" }));
    const tip = await screen.findByRole("tooltip");
    expect(within(tip).getByText(detail.path)).toBeInTheDocument();
    expect(tip).not.toHaveTextContent("版本");
    expect(tip).not.toHaveTextContent("收录时间");
    expect(mockFetchSkillDetail).toHaveBeenCalledWith(
      "anthropics/skills",
      "pdf",
      "skills/anthropics/skills/pdf",
    );
  });

  it("shows the registry version fingerprint and when that version was recorded", async () => {
    const user = userEvent.setup();
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderDrawer({ skill: versionedSkill });

    await screen.findByText("Use this skill for PDFs.");
    // All provenance is collapsed into the 源 tip: hover reveals the full
    // hash, the first-seen date and the exact SKILL.md path.
    await user.hover(screen.getByRole("link", { name: "源" }));
    const tip = await screen.findByRole("tooltip");
    expect(within(tip).getByText(versionedSkill.rev!)).toBeInTheDocument();
    expect(tip).toHaveTextContent(SEEN_AT_LOCALE);
    expect(within(tip).getByText(detail.path)).toBeInTheDocument();
  });

  it("links the source repo, its skills.sh page and the mirror SKILL.md", async () => {
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderDrawer({ skill: { ...skill, path: "skills/anthropics/skills/pdf" } });

    await screen.findByText("Use this skill for PDFs.");
    // The repo link lands on the repo root: the mirror id no longer carries
    // the skill's directory inside the upstream repo.
    expect(
      screen.getByRole("link", { name: "anthropics/skills" }),
    ).toHaveAttribute("href", "https://github.com/anthropics/skills");
    // The skills.sh page is the deepest upstream link that survives; the
    // header keeps it as an icon-only control next to the stats.
    expect(screen.getByRole("link", { name: /skills\.sh/ })).toHaveAttribute(
      "href",
      "https://www.skills.sh/anthropics/skills/pdf",
    );
    // The mirror SKILL.md is the 源 link's target; its path text hides in
    // the link's tooltip.
    expect(screen.getByRole("link", { name: "源" })).toHaveAttribute(
      "href",
      "https://github.com/skill-one/skills-sh-mirror/blob/dist/skills/anthropics/skills/pdf/SKILL.md",
    );
  });

  it("reads the installed copy from disk but keeps the GitHub links when the registry path is gone", async () => {
    mockFetchLocalSkillDetail.mockResolvedValue(detail);
    renderDrawer({ skill: { ...skill, path: undefined } });

    await screen.findByText("Use this skill for PDFs.");
    expect(mockFetchLocalSkillDetail).toHaveBeenCalledWith("pdf");
    expect(mockFetchSkillDetail).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "anthropics/skills" }),
    ).toHaveAttribute("href", "https://github.com/anthropics/skills");
  });

  it("reads pure local skills from disk without store-only header parts", async () => {
    const user = userEvent.setup();
    mockFetchLocalSkillDetail.mockResolvedValue(localDetail);
    renderDrawer({ skill: localSkill });

    expect(await screen.findByText("Local skill body.")).toBeInTheDocument();
    expect(mockFetchLocalSkillDetail).toHaveBeenCalledWith("my-tool");
    expect(mockFetchSkillDetail).not.toHaveBeenCalled();
    // No repo → no links at all, a 本地安装 caption and a cover slot with no
    // id to address a real image with (the skill's initial stands in); the
    // disk path sits behind 本地文件, and no stats.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("本地安装")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "my-tool 封面图" })).toHaveTextContent(
      "m",
    );
    expect(screen.queryByText(localDetail.path)).not.toBeInTheDocument();
    await user.hover(screen.getByText("本地文件"));
    const tip = await screen.findByRole("tooltip");
    expect(within(tip).getByText(localDetail.path)).toBeInTheDocument();
    // No registry stats for a pure local skill: no popularity figure at all.
    expect(
      screen.queryByRole("button", { name: /^热度 / }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("3M")).not.toBeInTheDocument();
  });

  it("opens the source link through the system browser on click", async () => {
    const user = userEvent.setup();
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderDrawer({ skill: { ...skill, path: "skills/pdf" } });

    await screen.findByText("Use this skill for PDFs.");
    await user.click(screen.getByRole("link", { name: "anthropics/skills" }));
    expect(mockOpenExternal).toHaveBeenCalledWith(
      "https://github.com/anthropics/skills",
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

  it("offers no uninstall for a skill that is not on disk", async () => {
    renderDrawer({});

    // The install action is the header's only action while nothing is
    // installed — the panel is the store's detail view too.
    expect(
      await screen.findByRole("button", { name: "安装" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "移除" }),
    ).not.toBeInTheDocument();
    // Enablement belongs to the installed list: the store's card, and so its
    // drawer, has no switch to offer.
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("swaps the install CTA for the enable switch on the installed surface", async () => {
    vi.mocked(fetchInstalledSkills).mockResolvedValue([installedPdf]);
    mockFetchLocalSkillDetail.mockResolvedValue(detail);
    // Exactly what the installed list hands the drawer (`detailSkillFor`): the
    // recorded repo, but no mirror path — the body is read off disk.
    renderDrawer({ skill: { ...skill, path: undefined }, surface: "installed" });

    // The switch the row carries, in the slot the store puts its CTA in.
    expect(
      await screen.findByRole("switch", { name: "关闭 pdf" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "安装" }),
    ).not.toBeInTheDocument();
    // No registry figures: the record has none to report, and claiming a 0
    // would contradict the card, which shows no figure at all.
    expect(
      screen.queryByRole("button", { name: /^热度 / }),
    ).not.toBeInTheDocument();
    // The recorded repo still drives everything it can: the source link.
    expect(
      screen.getByRole("link", { name: "anthropics/skills" }),
    ).toBeInTheDocument();
  });

  it("disables an installed skill from the drawer's switch", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchInstalledSkills).mockResolvedValue([installedPdf]);
    mockSetSkillEnabled.mockResolvedValue(undefined);
    mockFetchLocalSkillDetail.mockResolvedValue(detail);
    renderDrawer({ skill: { ...skill, path: undefined }, surface: "installed" });

    await user.click(await screen.findByRole("switch", { name: "关闭 pdf" }));

    expect(mockSetSkillEnabled).toHaveBeenCalledWith("pdf", false);
  });

  it("uninstalls an installed skill from the header", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchInstalledSkills).mockResolvedValue([installedPdf]);
    mockRemoveInstalledSkill.mockResolvedValue(undefined);
    renderDrawer({});

    await user.click(await screen.findByRole("button", { name: "移除" }));

    expect(mockRemoveInstalledSkill).toHaveBeenCalledWith("pdf");
  });

  it("uninstalls a local skill, which has no install action to pair with", async () => {
    vi.mocked(fetchInstalledSkills).mockResolvedValue([
      { ...installedPdf, name: "my-tool" },
    ]);
    mockFetchLocalSkillDetail.mockResolvedValue(localDetail);
    renderDrawer({ skill: localSkill });

    expect(
      await screen.findByRole("button", { name: "移除" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "安装" }),
    ).not.toBeInTheDocument();
  });

  it("lands on the 概述 tab and keeps SKILL.md one click away for a profiled skill", async () => {
    const user = userEvent.setup();
    mockFetchSkillProfile.mockResolvedValue({
      scenario: "找不到现成 skill？它替你搜。",
      taglines: ["一搜即装", "只荐对的"],
      blackbox: {
        function: "把一句话需求变成装好的 skill。",
        inputOutput: [{ input: "我想做 X", output: "推荐的 skill" }],
      },
      comments: [
        {
          user: "后端老兵",
          category: "妙用",
          comment: "用 --owner 锁定官方源。",
        },
      ],
    });
    // A profiled skill carries both the index profile and a mirror path.
    renderDrawer({
      skill: {
        ...skill,
        profile: {
          domain: "开发编程",
          reason: "dev tooling",
          persona: {
            tool: "npx skills",
            role: "技能猎头",
            scene: "需要找 skill 时",
          },
        },
      },
    });

    // 概述 is the default landing tab (tabs mount once the detail fetch
    // resolves), and the inactive SKILL.md body is not even mounted yet.
    expect(
      await screen.findByRole("tab", { name: "概述" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Use this skill for PDFs."),
    ).not.toBeInTheDocument();

    // Structured layout: lead quote + tool, slogans, pitch, input/output,
    // and categorized user comments.
    // The scene renders as a curly-quoted lead paragraph.
    expect(await screen.findByText(/需要找 skill 时/)).toBeInTheDocument();
    expect(screen.getByText("谋生工具：")).toBeInTheDocument();
    expect(screen.getByText("一搜即装")).toBeInTheDocument();
    expect(
      screen.getByText("找不到现成 skill？它替你搜。"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/把一句话需求变成装好的 skill。/),
    ).toBeInTheDocument();
    expect(screen.getByText("我想做 X")).toBeInTheDocument();
    expect(screen.getByText("推荐的 skill")).toBeInTheDocument();
    // User comments render as an avatar-less stream: section heading,
    // category badge + nickname attribution above the body, each note
    // hanging off a category-colored left rail.
    expect(screen.getByText("用户评论")).toBeInTheDocument();
    expect(screen.getByText("后端老兵")).toBeInTheDocument();
    expect(screen.getByText("妙用")).toBeInTheDocument();
    expect(screen.getByText("用 --owner 锁定官方源。")).toBeInTheDocument();
    expect(screen.queryByText("用户笔记")).not.toBeInTheDocument();

    // The canonical source is one click away.
    await user.click(screen.getByRole("tab", { name: "SKILL.md" }));
    expect(
      await screen.findByText("Use this skill for PDFs."),
    ).toBeInTheDocument();
  });

  it("keeps the plain SKILL.md body for an unprofiled skill", async () => {
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderDrawer({ skill });

    await screen.findByText("Use this skill for PDFs.");
    // No tabs at all when the dataset has not profiled the skill.
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(mockFetchSkillProfile).not.toHaveBeenCalled();
  });

  it("clamps a long header summary so it cannot push the body out of the drawer", async () => {
    const longDescription = Array.from(
      { length: 40 },
      () => "A long summary.",
    ).join(" ");
    mockFetchSkillDetail.mockResolvedValue({
      ...detail,
      description: longDescription,
    });
    renderDrawer({ skill: { ...skill, description: longDescription } });

    await screen.findByText("Use this skill for PDFs.");
    // Clamped by default, but the full text is still in the DOM: clamping is a
    // painting concern, so the toggle is pure CSS plus the overflow check.
    const summary = screen.getByText(longDescription);
    expect(summary).toHaveClass("line-clamp-3");
    expect(screen.queryByRole("button", { name: "展开" })).not.toBeInTheDocument();
  });

  it("keeps a summary that fits free of any toggle", async () => {
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderDrawer({});

    expect(await screen.findByText(detail.description)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "展开" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "收起" })).not.toBeInTheDocument();
  });
});
