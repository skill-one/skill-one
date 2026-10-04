import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  fetchSkillDetail,
  fetchSkillZhDetail,
} from "../../lib/skill-detail-api";
import {
  fetchInstalledSkills,
  fetchLocalSkillDetail,
  openInstalledSkillDir,
  readLocalSkillRaw,
  removeInstalledSkill,
  saveLocalSkillMd,
  setSkillEnabled,
} from "../../lib/local-skills";
import { openExternal } from "../../lib/open-external";
import type { SkillView } from "../../lib/skill-view";
import { LANGUAGE_STORAGE_KEY } from "../../lib/i18n-content";
import i18n from "../../i18n/index";
import { useSkillProvenance } from "../../hooks/use-skill-provenance";
import { findLinkCandidates, unlinkSkillSource } from "../../lib/link-suggestions";
import { Sheet } from "../ui/sheet";
import { I18nProvider } from "../../i18n/language-provider";
import { toast } from "../ui/toast";
import {
  SkillDetailPanel,
  type SkillDetailSurface,
} from "./skill-detail-panel";

vi.mock("../../lib/skill-detail-api", () => ({
  fetchSkillDetail: vi.fn(),
  fetchSkillZhDetail: vi.fn(),
}));

vi.mock("../../lib/local-skills", () => ({
  fetchLocalSkillDetail: vi.fn(),
  fetchInstalledSkills: vi.fn(),
  openInstalledSkillDir: vi.fn(),
  readLocalSkillRaw: vi.fn(),
  removeInstalledSkill: vi.fn(),
  saveLocalSkillMd: vi.fn(),
  setSkillEnabled: vi.fn(),
}));

vi.mock("../../lib/open-external", () => ({
  openExternal: vi.fn(),
}));

// The source-linking flows the panel composes are covered by their own
// suites; here they are stubbed so the tests pin what the panel itself
// renders and calls.
vi.mock("../../hooks/use-skill-provenance", () => ({
  useSkillProvenance: vi.fn(),
}));
vi.mock("../../lib/link-suggestions", () => ({
  findLinkCandidates: vi.fn(),
  unlinkSkillSource: vi.fn(),
}));

vi.mock("./skill-editor", () => ({
  // A controlled textarea stands in for CodeMirror: the flow under test is the
  // panel's edit session, not the editor widget itself.
  SkillEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="编辑器"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

const mockFetchSkillDetail = vi.mocked(fetchSkillDetail);
const mockFetchSkillZhDetail = vi.mocked(fetchSkillZhDetail);
const mockFetchLocalSkillDetail = vi.mocked(fetchLocalSkillDetail);
const mockOpenInstalledSkillDir = vi.mocked(openInstalledSkillDir);
const mockReadLocalSkillRaw = vi.mocked(readLocalSkillRaw);
const mockRemoveInstalledSkill = vi.mocked(removeInstalledSkill);
const mockSaveLocalSkillMd = vi.mocked(saveLocalSkillMd);
const mockSetSkillEnabled = vi.mocked(setSkillEnabled);
const mockOpenExternal = vi.mocked(openExternal);

/** One entry of the installed list, as the backend reports it. */
const installedPdf = {
  name: "pdf",
  path: "/Users/me/.agents/skills/pdf",
  enabled: true,
  description: "Read and merge PDF documents.",
  installedAt: 1_760_000_000,
};

const skill: SkillView = {
  name: "pdf",
  repo: "anthropics/skills",
  description: "Read and merge PDF documents.",
  stars: 169600,
  downloads: 2991984,
  path: "skills/anthropics/skills/pdf",
  url: "https://www.skills.sh/anthropics/skills/pdf",
};

/**
 * A skill placed manually into the global directory: no repo, disk read, and —
 * because no source resolved to a store entry — nothing the registry can vouch
 * for, which is what `storeBacked: false` records.
 */
const localSkill: SkillView = {
  name: "my-tool",
  repo: "",
  description: "",
  stars: 0,
  downloads: 0,
  storeBacked: false,
};


const detail = {
  description: "Read and merge PDF documents.",
  license: "MIT",
  author: "Anthropic",
  instructions: "Use this skill for PDFs.",
  path: "skills/anthropics/skills/pdf/SKILL.md",
};

const localDetail = {
  description: "",
  instructions: "Local skill body.",
  path: "/Users/me/.agents/skills/my-tool/SKILL.md",
};

let queryClient: QueryClient;

/**
 * The panel renders the content side of the modal detail Sheet (see
 * `SkillDetailDrawer`), so the tests mount it inside a stateful open Sheet
 * exactly like the pages do. It starts open only when a skill is present,
 * mirroring the drawer's `open = skill != null` wiring.
 */
function DetailDrawer({
  skill: currentSkill,
  surface,
  onPrev,
  onNext,
}: {
  skill: SkillView | null;
  surface?: SkillDetailSurface;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const [open, setOpen] = useState(currentSkill != null);
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <Sheet open={open} onOpenChange={setOpen}>
          <SkillDetailPanel
            skill={currentSkill}
            surface={surface}
            onPrev={onPrev ?? (() => {})}
            onNext={onNext ?? (() => {})}
          />
        </Sheet>
      </I18nProvider>
    </QueryClientProvider>
  );
}

function renderDrawer(
  props: Partial<Parameters<typeof DetailDrawer>[0]> & {
    skill?: SkillView | null;
  },
) {
  return render(<DetailDrawer skill={skill} {...props} />);
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  mockFetchSkillDetail.mockReset();
  mockFetchLocalSkillDetail.mockReset();
  mockOpenInstalledSkillDir.mockReset();
  mockReadLocalSkillRaw.mockReset();
  mockSaveLocalSkillMd.mockReset();
  mockSetSkillEnabled.mockReset();
  mockOpenExternal.mockReset();
  mockFetchSkillDetail.mockResolvedValue(detail);
  // The suite's pinned zh locale turns the Chinese-page query on for every
  // mirror read; most snapshots rows ship no translation, so null is the
  // baseline and the English body keeps leading unless a test says otherwise.
  mockFetchSkillZhDetail.mockResolvedValue(null);
  // The header install button reads the installed list; nothing is
  // installed unless a test says otherwise.
  vi.mocked(fetchInstalledSkills).mockResolvedValue([]);
  // The provenance hook answers empty by default: no suggestions, no
  // candidates. Individual tests override what they need.
  vi.mocked(useSkillProvenance).mockReset();
  vi.mocked(useSkillProvenance).mockReturnValue({ data: undefined } as never);
  vi.mocked(findLinkCandidates).mockReset();
  vi.mocked(findLinkCandidates).mockResolvedValue([]);
  vi.mocked(unlinkSkillSource).mockReset();
  vi.mocked(unlinkSkillSource).mockResolvedValue(undefined);
});

describe("SkillDetailPanel", () => {
  it("renders nothing when no skill is selected", () => {
    renderDrawer({ skill: null });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockFetchSkillDetail).not.toHaveBeenCalled();
  });

  it("opens wider than the default sheet, capped relative to the window", async () => {
    renderDrawer({});
    // The default `sm:max-w-sm` sheet cannot hold the SKILL.md prose; the
    // panel overrides it (under the same `data-[side=right]` variant the
    // default cap rides, so twMerge drops it) with a min() cap that follows
    // the window width.
    expect(await screen.findByRole("dialog")).toHaveClass(
      "data-[side=right]:sm:max-w-[min(48rem,55vw)]",
    );
  });

  it("shows skill info and the fetched SKILL.md", async () => {
    mockFetchSkillDetail.mockResolvedValue(detail);
    // The drawer is portalled out of the render container, so everything it
    // owns — including the absence assertions below — is only reachable
    // through `baseElement`. Scoping the negatives to `container` would make
    // them pass no matter what the drawer rendered.
    const { baseElement } = renderDrawer({});

    // Await the async detail content first; the rest renders with it.
    expect(
      await screen.findByText("Use this skill for PDFs."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // The header leads with the skill's name itself; no cover slot stands
    // in front of it.
    expect(
      screen.queryByRole("img", { name: "pdf 封面图" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("pdf")).toBeInTheDocument();
    // The enlarged owner avatar leads the identity block — the name and the
    // repo line it spans — outside the repo link, which keeps only the text.
    // It is decoration, so it still never joins the link's name.
    expect(
      screen
        .getByRole("link", { name: "anthropics/skills" })
        .querySelector('[data-slot="avatar"]'),
    ).toBeNull();
    expect(baseElement.querySelector('[data-slot="avatar"]')).not.toBeNull();
    expect(screen.getByText("anthropics/skills")).toBeInTheDocument();
    // The meta line is quiet dot-separated text: no author badge (the repo
    // line's avatar and repo already say who published it) and no license.
    expect(screen.queryByText("Anthropic")).not.toBeInTheDocument();
    expect(screen.queryByText("MIT")).not.toBeInTheDocument();
    // The same popularity figure the list rows show: the blend on the
    // trigger, its accessible name spelling out the two counts it blends.
    expect(screen.getByText("712.4K")).toBeInTheDocument();
    expect(
      screen.getByLabelText("热度 712.4K：安装 3M · Star 169.6K"),
    ).toBeInTheDocument();
    expect(screen.queryByText("169.6K")).not.toBeInTheDocument();
    // The exact path is provenance detail: hidden behind the 源 tip by
    // default, and an unhashed entry's tip carries no version lines at all.
    expect(screen.queryByText(detail.path)).not.toBeInTheDocument();
    // Focus (the a11y path) instead of hover: hover-open inside the modal
    // drawer is unreliable under jsdom; real-browser hover is covered by the
    // list-row tooltip tests outside a modal layer.
    screen.getByRole("link", { name: "源" }).focus();
    const tip = await screen.findByRole("tooltip");
    expect(within(tip).getByText(detail.path)).toBeInTheDocument();
    tip.blur();
    expect(tip).not.toHaveTextContent("版本");
    expect(tip).not.toHaveTextContent("收录时间");
    expect(mockFetchSkillDetail).toHaveBeenCalledWith(
      "anthropics/skills",
      "pdf",
      "skills/anthropics/skills/pdf",
    );
  });

  it("shows the mirror path in the 源 tip", async () => {
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderDrawer({ skill });

    await screen.findByText("Use this skill for PDFs.");
    // All provenance is collapsed into the 源 tip: hover reveals the exact
    // SKILL.md path.
    // Focus path, as above: hover-open inside the modal drawer is flaky
    // under jsdom.
    screen.getByRole("link", { name: "源" }).focus();
    const tip = await screen.findByRole("tooltip");
    expect(within(tip).getByText(detail.path)).toBeInTheDocument();
  });

  it("links the source repo and the mirror SKILL.md, and nothing else", async () => {
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderDrawer({ skill: { ...skill, path: "skills/anthropics/skills/pdf" } });

    await screen.findByText("Use this skill for PDFs.");
    // The repo link lands on the repo root: the mirror id no longer carries
    // the skill's directory inside the upstream repo.
    expect(
      screen.getByRole("link", { name: "anthropics/skills" }),
    ).toHaveAttribute("href", "https://github.com/anthropics/skills");
    // The skills.sh page is gone from the drawer: the repo link is the one
    // external door the header offers.
    expect(
      screen.queryByRole("link", { name: /skills\.sh/ }),
    ).not.toBeInTheDocument();
    // The mirror SKILL.md is the 源 link's target; its path text hides in
    // the link's tooltip.
    expect(screen.getByRole("link", { name: "源" })).toHaveAttribute(
      "href",
      "https://github.com/skill-one/skills-profiles/blob/dist/skills/anthropics/skills/pdf/SKILL.md",
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
    const { baseElement } = renderDrawer({ skill: localSkill });

    expect(await screen.findByText("Local skill body.")).toBeInTheDocument();
    expect(mockFetchLocalSkillDetail).toHaveBeenCalledWith("my-tool");
    expect(mockFetchSkillDetail).not.toHaveBeenCalled();
    // No repo → no links at all and a 第三方安装 caption; the disk path sits
    // behind 本地文件, and no stats.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("第三方安装")).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: "my-tool 封面图" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(localDetail.path)).not.toBeInTheDocument();
    await user.hover(screen.getByText("本地文件"));
    const tip = await screen.findByRole("tooltip");
    expect(within(tip).getByText(localDetail.path)).toBeInTheDocument();
    // No registry stats for a pure local skill: no install figure at all.
    expect(screen.queryByText("安装量")).not.toBeInTheDocument();
    expect(screen.queryByTitle(/次安装/)).not.toBeInTheDocument();
    // No description → nothing to estimate, so no token figure either.
    expect(baseElement.querySelector('[data-slot="token-estimate"]')).toBeNull();
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
    // The overlay is portalled out of the render container, so it takes
    // `baseElement` to be reachable at all.
    const { baseElement } = renderDrawer({});

    await screen.findByText("Use this skill for PDFs.");
    const overlay = baseElement.querySelector('[data-slot="sheet-overlay"]');
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
    // What the installed list hands the drawer for a resolved store entry
    // (`installedSkillView`): the recorded repo and the registry's figures, but
    // no mirror path — the body is read off disk.
    renderDrawer({ skill: { ...skill, path: undefined }, surface: "installed" });

    // The switch the row carries, in the slot the store puts its CTA in.
    expect(
      await screen.findByRole("switch", { name: "关闭 pdf" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "安装" }),
    ).not.toBeInTheDocument();
    // The registry backs this skill, so its figure is real and shown — the same
    // one its card shows.
    expect(
      screen.getByLabelText("热度 712.4K：安装 3M · Star 169.6K"),
    ).toBeInTheDocument();
    // The recorded repo still drives everything it can: the source link.
    expect(
      screen.getByRole("link", { name: "anthropics/skills" }),
    ).toBeInTheDocument();
  });

  it("reports how long ago an installed skill landed on disk", async () => {
    vi.mocked(fetchInstalledSkills).mockResolvedValue([installedPdf]);
    mockFetchLocalSkillDetail.mockResolvedValue(detail);
    // Three days ago: far from any bucket boundary, so the relative label is
    // deterministic without freezing the clock. The bucketing itself is
    // proven against a fixed clock in `utils.test.ts`.
    const installedAt = Math.floor(Date.now() / 1000) - 3 * 24 * 60 * 60;
    // What the installed list hands the drawer: the on-disk fact the registry
    // cannot know — when the skill landed (agents-skills 0.16).
    renderDrawer({
      skill: { ...skill, path: undefined, installedAt },
      surface: "installed",
    });

    expect(await screen.findByText("3天前")).toHaveAttribute(
      "data-slot",
      "installed-at",
    );
  });

  it("shows no install date for a registry row", async () => {
    const { baseElement } = renderDrawer({});
    await screen.findByText("Use this skill for PDFs.");

    // A store row describes a skill the reader does not have on disk, so there
    // is no install to date.
    expect(baseElement.querySelector('[data-slot="installed-at"]')).toBeNull();
  });

  it("estimates the English description's token cost in the meta line", async () => {
    renderDrawer({});
    await screen.findByText("Read and merge PDF documents.");

    // Five words and a period: "≈ 6 tokens" — computed from the English
    // frontmatter description, whatever language the drawer displays.
    expect(screen.getByText(/6 tokens/)).toBeInTheDocument();
  });

  it("shows no store facts for an installed skill the registry does not know", async () => {
    vi.mocked(fetchInstalledSkills).mockResolvedValue([installedPdf]);
    mockFetchLocalSkillDetail.mockResolvedValue(detail);
    // `installedSkillView` marks an unresolved entry explicitly: the absence has
    // to stay readable, or the drawer would report an install count of 0.
    renderDrawer({
      skill: { ...skill, path: undefined, storeBacked: false },
      surface: "installed",
    });

    expect(
      await screen.findByRole("switch", { name: "关闭 pdf" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("安装量")).not.toBeInTheDocument();
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

    // The press opens the ask, not the act; the dialog's confirm removes.
    const ask = await screen.findByRole("dialog", { name: "移除 pdf？" });
    await user.click(within(ask).getByRole("button", { name: "移除" }));

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

  it("renders the SKILL.md body with no tabs, keeping the classification in the header", async () => {
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderDrawer({
      skill: { ...skill, profile: { domain: ["development"] } },
    });

    await screen.findByText("Use this skill for PDFs.");
    // The classification is a header chip; the body is the canonical source.
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByText("开发编程")).toBeInTheDocument();
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

  it("flips the header description to the original through the unified toggle", async () => {
    const user = userEvent.setup();
    renderDrawer({ skill: { ...skill, descriptionZh: "读取并合并 PDF 文档。" } });

    // The zh suite locale shows the registry's translation in the header, and
    // the drawer's one toggle sits in the header's action row, resting flat
    // (aria-pressed=false) while the translation leads.
    expect(
      await screen.findByText("读取并合并 PDF 文档。"),
    ).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "原文" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);

    // The English original replaces the translation in place — no popover
    // layer — and the toggle lights up (aria-pressed=true) to mark the mode.
    expect(
      screen.getByText("Read and merge PDF documents."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("读取并合并 PDF 文档。"),
    ).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await user.click(toggle);
    expect(screen.getByText("读取并合并 PDF 文档。")).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("offers no translation toggle without any translation", async () => {
    renderDrawer({});

    // The header already shows the original text and the snapshot ships no
    // Chinese page, so a toggle would be an affordance to the very content
    // on screen.
    await screen.findByText("Read and merge PDF documents.");
    expect(
      screen.queryByRole("button", { name: "原文" }),
    ).not.toBeInTheDocument();
  });
});

describe("SkillDetailPanel source linking", () => {
  /** A same-name store entry, as `findLinkCandidates` serves it. */
  const forkCandidate = {
    skill: {
      name: "pdf",
      repo: "fork/skills",
      description: "Read and merge PDF documents.",
      stars: 5,
      downloads: 6,
    },
    similarity: 0.8,
  };

  it("offers the change-source menu beside the repo line on the installed surface", async () => {
    mockFetchLocalSkillDetail.mockResolvedValue(detail);
    renderDrawer({
      skill: { ...skill, path: undefined, via: "install" },
      surface: "installed",
    });

    await screen.findByText("Use this skill for PDFs.");
    expect(
      screen.getByRole("button", { name: "更改 pdf 关联的来源" }),
    ).toBeInTheDocument();
  });

  it("offers no change-source menu on the store surface", async () => {
    renderDrawer({});

    await screen.findByText("Use this skill for PDFs.");
    expect(
      screen.queryByRole("button", { name: "更改 pdf 关联的来源" }),
    ).not.toBeInTheDocument();
  });

  it("lists the current source, the other namesakes and the unlink action", async () => {
    const user = userEvent.setup();
    vi.mocked(findLinkCandidates).mockResolvedValue([forkCandidate]);
    mockFetchLocalSkillDetail.mockResolvedValue(detail);
    renderDrawer({
      skill: { ...skill, path: undefined },
      surface: "installed",
    });

    await user.click(
      await screen.findByRole("button", { name: "更改 pdf 关联的来源" }),
    );
    expect(await screen.findByText("当前来源")).toBeInTheDocument();
    // The other same-name entries are offered; the current repo is pinned
    // once, as the source on record.
    expect(await screen.findByText("fork/skills")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /fork\/skills/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "解除关联" }),
    ).toBeInTheDocument();
  });

  it("re-links to the picked candidate as a user confirmation", async () => {
    const user = userEvent.setup();
    const toastSpy = vi.spyOn(toast, "add");
    vi.mocked(findLinkCandidates).mockResolvedValue([forkCandidate]);
    mockFetchLocalSkillDetail.mockResolvedValue(detail);
    renderDrawer({
      skill: { ...skill, path: undefined },
      surface: "installed",
    });

    await user.click(
      await screen.findByRole("button", { name: "更改 pdf 关联的来源" }),
    );
    await user.click(
      await screen.findByRole("button", { name: /fork\/skills/ }),
    );

    expect(unlinkSkillSource).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ title: "已关联来源：fork/skills" }),
      ),
    );
  });

  it("unlinks the source, dismissing the repo", async () => {
    const user = userEvent.setup();
    const toastSpy = vi.spyOn(toast, "add");
    mockFetchLocalSkillDetail.mockResolvedValue(detail);
    renderDrawer({
      skill: { ...skill, path: undefined },
      surface: "installed",
    });

    await user.click(
      await screen.findByRole("button", { name: "更改 pdf 关联的来源" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "解除关联" }),
    );

    expect(unlinkSkillSource).toHaveBeenCalledWith("pdf", "anthropics/skills");
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ title: "已解除关联，恢复为第三方安装" }),
      ),
    );
  });

  it("offers the link-suggestion badge for an unlinked skill with candidates", async () => {
    vi.mocked(useSkillProvenance).mockReturnValue({
      data: { suggestions: { "my-tool": [forkCandidate] } },
    } as never);
    mockFetchLocalSkillDetail.mockResolvedValue(localDetail);
    renderDrawer({ skill: localSkill, surface: "installed" });

    expect(
      await screen.findByRole("button", { name: "关联 my-tool 的商店来源" }),
    ).toBeInTheDocument();
  });

  it("keeps the plain local-install label for an unlinked skill without candidates", async () => {
    mockFetchLocalSkillDetail.mockResolvedValue(localDetail);
    renderDrawer({ skill: localSkill, surface: "installed" });

    await screen.findByText("Local skill body.");
    expect(screen.getByText("第三方安装")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "关联 my-tool 的商店来源" }),
    ).not.toBeInTheDocument();
  });
});

describe("SkillDetailPanel Chinese page", () => {
  /** The snapshot's Chinese page for the drawer's fixture skill. */
  const zhDetail = {
    description: "",
    instructions: "使用此技能处理 PDF。",
    path: "profiles/anthropics/skills/pdf/skill_zh.md",
  };

  it("leads the body with the snapshot's Chinese page, without fetching the English file", async () => {
    mockFetchSkillZhDetail.mockResolvedValue(zhDetail);
    renderDrawer({});

    // The Chinese page replaces the English body, and the divider names the
    // file actually shown. The English SKILL.md stays unfetched — the
    // deferred request only fires when the reader flips to it.
    expect(await screen.findByText("使用此技能处理 PDF。")).toBeInTheDocument();
    expect(screen.queryByText("Use this skill for PDFs.")).not.toBeInTheDocument();
    expect(screen.getByText("skill_zh.md")).toBeInTheDocument();
    expect(mockFetchSkillZhDetail).toHaveBeenCalledWith(
      "anthropics/skills",
      "pdf",
      "skills/anthropics/skills/pdf",
    );
    expect(mockFetchSkillDetail).not.toHaveBeenCalled();
  });

  it("keeps the 源 provenance pinned to the English SKILL.md", async () => {
    mockFetchSkillZhDetail.mockResolvedValue(zhDetail);
    renderDrawer({});

    await screen.findByText("使用此技能处理 PDF。");
    // The translation is garnish; provenance still describes the indexed
    // original, whatever body currently leads. The link derives from the
    // index row's directory, so it is pinned even with the English file
    // unfetched.
    expect(mockFetchSkillDetail).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "源" })).toHaveAttribute(
      "href",
      "https://github.com/skill-one/skills-profiles/blob/dist/skills/anthropics/skills/pdf/SKILL.md",
    );
  });

  it("fetches the English original on the first flip to the original and caches it", async () => {
    const user = userEvent.setup();
    // The suite's bare client has staleTime 0, under which every cached
    // result is instantly stale and a re-render refetches — an artifact no
    // real session sees (the app's client pins staleTime to 10 minutes, see
    // `lib/query-client.ts`). Match it, so the assertion says what it means:
    // the flip fetches once, and later flips ride the cache.
    queryClient.setDefaultOptions({
      queries: { retry: false, staleTime: 10 * 60 * 1000 },
    });
    mockFetchSkillZhDetail.mockResolvedValue(zhDetail);
    renderDrawer({});

    await screen.findByText("使用此技能处理 PDF。");
    expect(mockFetchSkillDetail).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "原文" }));

    // The original body leads again, the divider names it, and the toggle
    // offers the way back. The flip carried the English file's deferred
    // fetch — one request.
    expect(screen.getByText("Use this skill for PDFs.")).toBeInTheDocument();
    expect(screen.queryByText("使用此技能处理 PDF。")).not.toBeInTheDocument();
    expect(screen.getByText("SKILL.md")).toBeInTheDocument();
    expect(mockFetchSkillDetail).toHaveBeenCalledTimes(1);

    // Flipping back — and forth again — rides the cache: no second request.
    await user.click(screen.getByRole("button", { name: "原文" }));
    expect(screen.getByText("使用此技能处理 PDF。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "原文" }));
    expect(screen.getByText("Use this skill for PDFs.")).toBeInTheDocument();
    expect(mockFetchSkillDetail).toHaveBeenCalledTimes(1);
  });

  it("swaps the description and the body together on one toggle", async () => {
    const user = userEvent.setup();
    mockFetchSkillZhDetail.mockResolvedValue(zhDetail);
    renderDrawer({ skill: { ...skill, descriptionZh: "读取并合并 PDF 文档。" } });

    // Both parts start on the snapshot's translations: the registry's
    // description in the header, the Chinese page in the body (which lands
    // with its own fetch, hence the async find).
    expect(
      await screen.findByText("读取并合并 PDF 文档。"),
    ).toBeInTheDocument();
    expect(await screen.findByText("使用此技能处理 PDF。")).toBeInTheDocument();

    // One flip moves both to the originals — the drawer never mixes
    // languages.
    await user.click(screen.getByRole("button", { name: "原文" }));
    expect(screen.getByText("Read and merge PDF documents.")).toBeInTheDocument();
    expect(
      screen.queryByText("读取并合并 PDF 文档。"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Use this skill for PDFs.")).toBeInTheDocument();
    expect(screen.getByText("SKILL.md")).toBeInTheDocument();

    // And one flip back restores both.
    await user.click(screen.getByRole("button", { name: "原文" }));
    expect(screen.getByText("读取并合并 PDF 文档。")).toBeInTheDocument();
    expect(await screen.findByText("使用此技能处理 PDF。")).toBeInTheDocument();
    expect(screen.getByText("skill_zh.md")).toBeInTheDocument();
  });

  it("falls back to the English body, fetched on the spot, when the snapshot ships no Chinese page", async () => {
    renderDrawer({});

    // The null translation answer enables the English fetch right away, so
    // the untranslated skill's body still arrives — one request, no toggle.
    await screen.findByText("Use this skill for PDFs.");
    expect(mockFetchSkillDetail).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("skill_zh.md")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "原文" }),
    ).not.toBeInTheDocument();
  });

  it("fetches only the English file in en mode, with no translation entry", async () => {
    // Pin the stored preference before the provider mounts, the same way the
    // suite's zh pin does (see `src/test/setup.ts`).
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
    void i18n.changeLanguage("en");
    mockFetchSkillZhDetail.mockResolvedValue(zhDetail);
    renderDrawer({});

    // Even a skill the snapshot ships a Chinese page for reads the English
    // file alone in en mode — the snapshot's page is never requested, and no
    // language toggle exists to ask for it.
    expect(await screen.findByText("Use this skill for PDFs.")).toBeInTheDocument();
    expect(mockFetchSkillDetail).toHaveBeenCalledTimes(1);
    expect(mockFetchSkillZhDetail).not.toHaveBeenCalled();
    expect(screen.queryByText("skill_zh.md")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "原文" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the English body for a disk read whose snapshot directory is unknown", async () => {
    mockFetchSkillZhDetail.mockResolvedValue(zhDetail);
    mockFetchLocalSkillDetail.mockResolvedValue(detail);
    renderDrawer({ skill: { ...skill, path: undefined } });

    // Without the entry's snapshot directory (`snapshotPath`) the Chinese
    // page is unreachable, so the disk copy is all there is and the
    // translation fetch never fires.
    expect(await screen.findByText("Use this skill for PDFs.")).toBeInTheDocument();
    expect(mockFetchSkillZhDetail).not.toHaveBeenCalled();
  });
});

describe("SkillDetailPanel installed translation", () => {
  /** The snapshot's Chinese page for the drawer's fixture skill. */
  const zhDetail = {
    description: "",
    instructions: "使用此技能处理 PDF。",
    path: "profiles/anthropics/skills/pdf/skill_zh.md",
  };

  /**
   * An installed skill the registry still backs: the body reads off disk
   * (`path` undefined) while the entry's snapshot directory rides
   * `snapshotPath`, and the registry's translated description leads the
   * header in zh mode.
   */
  const installedBacked: SkillView = {
    ...skill,
    path: undefined,
    snapshotPath: "skills/anthropics/skills/pdf",
    descriptionZh: "读取并合并 PDF 文档。",
  };

  it("leads an installed skill's body with the snapshot's Chinese page", async () => {
    mockFetchSkillZhDetail.mockResolvedValue(zhDetail);
    mockFetchLocalSkillDetail.mockResolvedValue(detail);
    renderDrawer({ skill: installedBacked, surface: "installed" });

    // The Chinese page replaces the local body and the divider names the
    // file actually shown; the local English file stays unfetched until the
    // reader flips to it.
    expect(await screen.findByText("使用此技能处理 PDF。")).toBeInTheDocument();
    expect(screen.getByText("skill_zh.md")).toBeInTheDocument();
    expect(mockFetchSkillZhDetail).toHaveBeenCalledWith(
      "anthropics/skills",
      "pdf",
      "skills/anthropics/skills/pdf",
    );
    expect(mockFetchLocalSkillDetail).not.toHaveBeenCalled();
  });

  it("flips an installed skill back to the local file with the toggle", async () => {
    const user = userEvent.setup();
    mockFetchSkillZhDetail.mockResolvedValue(zhDetail);
    mockFetchLocalSkillDetail.mockResolvedValue(detail);
    renderDrawer({ skill: installedBacked, surface: "installed" });

    const toggle = await screen.findByRole("button", { name: "原文" });
    await user.click(toggle);

    // The original is the copy on disk — the file the user actually has.
    expect(await screen.findByText("Use this skill for PDFs.")).toBeInTheDocument();
    expect(mockFetchLocalSkillDetail).toHaveBeenCalledWith("pdf");
    expect(screen.getByText("SKILL.md")).toBeInTheDocument();
  });

  it("opens no caveat tooltip on the 原文 toggle", async () => {
    // The registry no longer publishes per-skill versions, so there is no
    // freshness to warn about — the toggle carries its plain label only.
    mockFetchSkillZhDetail.mockResolvedValue(zhDetail);
    renderDrawer({
      skill: installedBacked,
      surface: "installed",
    });

    const toggle = await screen.findByRole("button", { name: "原文" });
    toggle.focus();
  });
});

describe("SkillDetailPanel editing", () => {
  /** A raw SKILL.md: the editor opens on the file, frontmatter included. */
  const raw = "---\nname: pdf\n---\n\n# PDF\n\nBody.";

  it("offers no edit affordance on the store surface", async () => {
    renderDrawer({ surface: "store" });

    await screen.findByText("Use this skill for PDFs.");
    expect(
      screen.queryByRole("button", { name: "编辑" }),
    ).not.toBeInTheDocument();
  });

  it("edits an installed skill's raw file and saves it", async () => {
    const user = userEvent.setup();
    const toastSpy = vi.spyOn(toast, "add");
    mockReadLocalSkillRaw.mockResolvedValue(raw);
    renderDrawer({ surface: "installed" });

    await user.click(await screen.findByRole("button", { name: "编辑" }));

    const editor = await screen.findByLabelText("编辑器");
    expect(editor).toHaveValue(raw);
    // Nothing has changed yet, so there is nothing to save.
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();

    fireEvent.change(editor, { target: { value: `${raw}\nMore.` } });
    expect(screen.getByText("未保存的更改")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(mockSaveLocalSkillMd).toHaveBeenCalledWith("pdf", `${raw}\nMore.`);
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "已保存 pdf", type: "success" }),
    );
    // The panel drops back to the rendered view once the save lands.
    await waitFor(() =>
      expect(screen.queryByLabelText("编辑器")).not.toBeInTheDocument(),
    );
  });

  it("discards the draft on cancel", async () => {
    const user = userEvent.setup();
    mockReadLocalSkillRaw.mockResolvedValue(raw);
    renderDrawer({ surface: "installed" });

    await user.click(await screen.findByRole("button", { name: "编辑" }));
    const editor = await screen.findByLabelText("编辑器");
    fireEvent.change(editor, { target: { value: "changed" } });

    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(mockSaveLocalSkillMd).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("编辑器")).not.toBeInTheDocument();
  });

  it("disables save for a blank document", async () => {
    const user = userEvent.setup();
    mockReadLocalSkillRaw.mockResolvedValue(raw);
    renderDrawer({ surface: "installed" });

    await user.click(await screen.findByRole("button", { name: "编辑" }));
    const editor = await screen.findByLabelText("编辑器");
    fireEvent.change(editor, { target: { value: "   " } });

    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("opens the installed skill's directory next to the edit button", async () => {
    const user = userEvent.setup();
    mockOpenInstalledSkillDir.mockResolvedValue(undefined);
    renderDrawer({ surface: "installed" });

    await user.click(await screen.findByRole("button", { name: "打开文件夹" }));

    expect(mockOpenInstalledSkillDir).toHaveBeenCalledWith("pdf");
  });

  it("reports a failed open as an error toast", async () => {
    const user = userEvent.setup();
    const toastSpy = vi.spyOn(toast, "add");
    mockOpenInstalledSkillDir.mockRejectedValue(new Error("nope"));
    renderDrawer({ surface: "installed" });

    await user.click(await screen.findByRole("button", { name: "打开文件夹" }));

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error" }),
      ),
    );
  });

  it("offers no open-folder affordance on the store surface", async () => {
    renderDrawer({ surface: "store" });

    await screen.findByText("Use this skill for PDFs.");
    expect(
      screen.queryByRole("button", { name: "打开文件夹" }),
    ).not.toBeInTheDocument();
  });
});
