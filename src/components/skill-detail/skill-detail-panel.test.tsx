import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { fetchSkillDetail } from "../../lib/skill-detail-api";
import { formatDate } from "../../lib/utils";
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
import { Sheet } from "../ui/sheet";
import { I18nProvider } from "../../i18n/language-provider";
import { toast } from "../ui/toast";
import {
  SkillDetailPanel,
  type SkillDetailSurface,
} from "./skill-detail-panel";

vi.mock("../../lib/skill-detail-api", () => ({
  fetchSkillDetail: vi.fn(),
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

/** A registry entry that carries its version identity (the indexed majority). */
const versionedSkill: SkillView = {
  ...skill,
  rev: "b146008599c31057cef1c145774cea5d5afb30e8f43fa802e47a4b461419aaaf",
  firstSeenAt: "2026-08-12T04:34:54Z",
};

/**
 * How the panel renders `versionedSkill.firstSeenAt`: through the same
 * `formatDate` call the panel makes, in the locale the suite pins the UI to
 * (zh — see `src/test/setup.ts`). Deriving the expectation from the host's
 * default locale instead (a bare `toLocaleDateString`) breaks wherever the
 * host does not run in Chinese, which is exactly the mismatch the suite's
 * language pin exists to remove; sharing the pipeline also keeps both sides
 * on the same time zone, so the assertion cannot flip on one alone.
 */
const SEEN_AT_LOCALE = formatDate("2026-08-12T04:34:54Z", "zh") ?? "";

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
    renderDrawer({});

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
    expect(document.querySelector('[data-slot="avatar"]')).not.toBeNull();
    expect(screen.getByText("anthropics/skills")).toBeInTheDocument();
    // The meta line is quiet dot-separated text: no author badge (the repo
    // line's avatar and repo already say who published it) and no license.
    expect(screen.queryByText("Anthropic")).not.toBeInTheDocument();
    expect(screen.queryByText("MIT")).not.toBeInTheDocument();
    // One install figure, exactly like the list rows: the skill's own count,
    // compacted, with the exact number on the title and the wording for
    // assistive tech hidden inside it.
    expect(screen.getByText("3M")).toBeInTheDocument();
    expect(screen.getByText("安装量")).toHaveClass("sr-only");
    expect(screen.getByTitle("2,991,984 次安装")).toBeInTheDocument();
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

  it("shows the registry version fingerprint and when that version was recorded", async () => {
    mockFetchSkillDetail.mockResolvedValue(detail);
    renderDrawer({ skill: versionedSkill });

    await screen.findByText("Use this skill for PDFs.");
    // All provenance is collapsed into the 源 tip: hover reveals the full
    // hash, the first-seen date and the exact SKILL.md path.
    // Focus path, as above: hover-open inside the modal drawer is flaky
    // under jsdom.
    screen.getByRole("link", { name: "源" }).focus();
    const tip = await screen.findByRole("tooltip");
    expect(within(tip).getByText(versionedSkill.rev!)).toBeInTheDocument();
    tip.blur();
    expect(tip).toHaveTextContent(SEEN_AT_LOCALE);
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
    renderDrawer({ skill: localSkill });

    expect(await screen.findByText("Local skill body.")).toBeInTheDocument();
    expect(mockFetchLocalSkillDetail).toHaveBeenCalledWith("my-tool");
    expect(mockFetchSkillDetail).not.toHaveBeenCalled();
    // No repo → no links at all and a 本地安装 caption; the disk path sits
    // behind 本地文件, and no stats.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("本地安装")).toBeInTheDocument();
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
    const overlay = document.querySelector('[data-slot="sheet-overlay"]');
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
    expect(screen.getByText("安装量")).toBeInTheDocument();
    expect(screen.getByText("3M")).toBeInTheDocument();
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
    renderDrawer({});
    await screen.findByText("Use this skill for PDFs.");

    // A store row describes a skill the reader does not have on disk, so there
    // is no install to date.
    expect(document.querySelector('[data-slot="installed-at"]')).toBeNull();
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

  it("keeps the English original one popover away when a zh translation is shown", async () => {
    const user = userEvent.setup();
    renderDrawer({ skill: { ...skill, descriptionZh: "读取并合并 PDF 文档。" } });

    // The zh suite locale shows the registry's translation in the header.
    expect(
      await screen.findByText("读取并合并 PDF 文档。"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看原文" }));

    // The popover carries the English original the translation replaced.
    expect(
      await screen.findByText("Read and merge PDF documents."),
    ).toBeInTheDocument();
  });

  it("offers no original-description popover without a translation", async () => {
    renderDrawer({});

    // The header already shows the original text; a 查看原文 control would
    // be an affordance to the very text on screen.
    await screen.findByText("Read and merge PDF documents.");
    expect(
      screen.queryByRole("button", { name: "查看原文" }),
    ).not.toBeInTheDocument();
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
