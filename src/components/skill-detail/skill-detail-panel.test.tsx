import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { fetchSkillDetail } from "../../lib/skill-detail-api";
import {
  fetchInstalledSkills,
  fetchLocalSkillDetail,
  removeInstalledSkill,
  setSkillEnabled,
} from "../../lib/local-skills";
import { openExternal } from "../../lib/open-external";
import type { SkillView } from "../../lib/skill-view";
import { Sheet } from "../ui/sheet";
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
  removeInstalledSkill: vi.fn(),
  setSkillEnabled: vi.fn(),
}));

vi.mock("../../lib/open-external", () => ({
  openExternal: vi.fn(),
}));

const mockFetchSkillDetail = vi.mocked(fetchSkillDetail);
const mockFetchLocalSkillDetail = vi.mocked(fetchLocalSkillDetail);
const mockRemoveInstalledSkill = vi.mocked(removeInstalledSkill);
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
      <Sheet open={open} onOpenChange={setOpen}>
        <SkillDetailPanel
          skill={currentSkill}
          surface={surface}
          onPrev={onPrev ?? (() => {})}
          onNext={onNext ?? (() => {})}
        />
      </Sheet>
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
});
