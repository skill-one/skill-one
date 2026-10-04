import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { SkillRow } from "./skill-row";
import { RepoCard } from "./repo-card";
import { TooltipProvider } from "../../components/ui/tooltip";
import { renderWithRouter } from "../../test/test-utils";
import { estimateTokens } from "../../lib/token-estimate";
import { MEDAL_CLASSES } from "../../lib/ordinal";
import type { SkillView } from "../../lib/skill-view";

/**
 * How many times the rows actually rendered. The row is where a list's size
 * becomes a page's cost, so "did this row re-render" needs to be answerable
 * without a profiler in the room: a memoized row skips its *whole subtree*, so
 * a component every row draws is an exact witness. HighlightedText is that
 * component here — it is the one thing on the row that has no reason to exist
 * outside a search, which makes it a natural place to hang the count.
 */
const rowRenders = vi.fn();

vi.mock("../../components/highlighted-text", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../components/highlighted-text")>()),
  HighlightedText: ({ text }: { text: string }) => {
    rowRenders(text);
    return text;
  },
}));

/**
 * A live skills.sh hit sourced from a GitHub repository: no store entry, but
 * the id `owner/repo/slug` installs can hand to agents-skills rebuilds from
 * the row alone.
 */
const repoLive: SkillView = {
  name: "find-skills",
  repo: "vercel-labs/skills",
  description: "",
  stars: 0,
  downloads: 100,
  url: "https://www.skills.sh/vercel-labs/skills/find-skills",
  storeBacked: false,
};

/** A live hit whose source is a discovery domain, not a GitHub repository. */
const domainLive: SkillView = {
  ...repoLive,
  name: "lark-skill-maker",
  repo: "open.feishu.cn",
  url: "https://www.skills.sh/open.feishu.cn/lark-skill-maker",
};

function renderRow(
  skill: SkillView,
  fact?: "popularity" | "installedAt" | "tokens",
  ranked = true,
) {
  return renderWithRouter(
    <TooltipProvider>
      <ul>
        <SkillRow
          skill={skill}
          index={0}
          fact={fact}
          ranked={ranked}
          onSelect={() => {}}
        />
      </ul>
    </TooltipProvider>,
  );
}

describe("SkillRow live-hit install button", () => {
  it("keeps the install button on a live hit a GitHub id rebuilds for", () => {
    const { container } = renderRow(repoLive);
    // The corner action is the row's only real <button> element (the row
    // itself is a div with `role="button"`).
    expect(container.querySelector("button")).not.toBeNull();
  });

  it("withholds the install button when the source is a discovery domain", () => {
    // `open.feishu.cn/lark-skill-maker` is no `owner/repo/slug` id — the
    // backend can only refuse the install, so the row offers its skills.sh
    // page instead of a button that can only fail.
    const { container } = renderRow(domainLive);
    expect(container.querySelector("button")).toBeNull();
  });
});

describe("the row's own re-rendering", () => {
  /**
   * The handler both rows are given, held across renders. A caller that wrote
   * `onSelect={() => open(key)}` inline would hand every row a new prop on every
   * render and re-render the lot — which is the whole reason the row takes a
   * key and every caller passes a handler it already had.
   */
  const noop = () => {};

  // Two rows of a list, and the one fact a reader changes: which row is open.
  // Everything else about them — the skills, their positions, the handler — is
  // held still, because that is the situation a list is in most of the time.
  const rows = (open: string | null) => (
    <ul>
      <SkillRow
        skill={repoLive}
        index={0}
        selected={open === "repo"}
        onSelect={noop}
      />
      <SkillRow
        skill={domainLive}
        index={1}
        selected={open === "domain"}
        onSelect={noop}
      />
    </ul>
  );

  it("leaves every row untouched when nothing about the list changed", () => {
    const { rerender } = renderWithRouter(
      <TooltipProvider>{rows(null)}</TooltipProvider>,
    );
    rowRenders.mockClear();

    rerender(<TooltipProvider>{rows(null)}</TooltipProvider>);

    // A page of skills is the one surface where re-rendering the page and
    // re-rendering every row in it are the same cost. So a row that was handed
    // the same skill, the same position and a handler it already had does not
    // re-render at all.
    expect(rowRenders).not.toHaveBeenCalled();
  });

  it("re-renders the row that changed, so the list is never a stale one", () => {
    const { rerender } = renderWithRouter(
      <TooltipProvider>{rows(null)}</TooltipProvider>,
    );
    rowRenders.mockClear();

    rerender(<TooltipProvider>{rows("repo")}</TooltipProvider>);

    // The opened row is the one thing that genuinely differs, and it is the one
    // row that redraws: skipping it would trade a page's cost for a wrong page.
    expect(rowRenders).toHaveBeenCalledTimes(1);
    expect(rowRenders).toHaveBeenCalledWith("find-skills");
  });

  it("cannot be memoized away by a caller that rebuilds its handler", () => {
    // The failure mode this API shape exists to prevent, pinned so the shape
    // cannot be "simplified" back into it: a fresh closure per row is a new
    // prop on every row, and the list pays for it in full every time anything
    // above it moves.
    const { rerender } = renderWithRouter(
      <TooltipProvider>{rows(null)}</TooltipProvider>,
    );
    rowRenders.mockClear();

    rerender(
      <TooltipProvider>
        <ul>
          <SkillRow
            skill={repoLive}
            index={0}
            selected={false}
            onSelect={() => {}}
          />
          <SkillRow
            skill={domainLive}
            index={1}
            selected={false}
            onSelect={() => {}}
          />
        </ul>
      </TooltipProvider>,
    );

    expect(rowRenders).toHaveBeenCalledTimes(2);
  });
});

describe("SkillRow figure slot", () => {
  // An installed row the store *can* resolve: backed (so the blend is a fact
  // it may state) and carrying the install stamp only a local record has.
  const installed: SkillView = {
    name: "pdf",
    repo: "anthropics/skills",
    description: "PDF 文档读取、生成、合并、拆分与标注。",
    stars: 169600,
    downloads: 2991984,
    // Three days ago — a whole number of days, so the relative rendering
    // ("3天前") is exact regardless of when the test runs.
    installedAt: Math.floor(Date.now() / 1000) - 3 * 24 * 60 * 60,
  };
  // The pool's shape: an install no store entry backs. The blend is not a
  // fact it may state, but its stamp is — the stamp is local, the blend is
  // not.
  const localPool: SkillView = { ...installed, storeBacked: false };

  it("states the popularity blend by default", () => {
    renderRow(installed);
    expect(screen.getByLabelText(/^热度 /)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^安装于 /)).toBeNull();
  });

  it("states the install stamp when the list answers by install time", () => {
    renderRow(installed, "installedAt");
    expect(screen.getByLabelText(/^安装于 3天前/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^热度 /)).toBeNull();
  });

  it("states the stamp on a row the store cannot back, too", () => {
    // The source-less pool is exactly the row the 按安装时间 sort still
    // orders by time — a local fact no registry entry is needed for.
    renderRow(localPool, "installedAt");
    expect(screen.getByLabelText(/^安装于 3天前/)).toBeInTheDocument();
  });

  it("renders no blend on a row the store cannot back", () => {
    renderRow(localPool);
    expect(screen.queryByLabelText(/^热度 /)).toBeNull();
  });

  it("renders nothing in the slot when no install time is recorded", () => {
    // Some filesystems record no creation time; an absent stamp is an absent
    // fact, never a zero.
    renderRow({ ...installed, installedAt: null }, "installedAt");
    expect(screen.queryByLabelText(/^安装于 /)).toBeNull();
    expect(screen.queryByLabelText(/^热度 /)).toBeNull();
  });

  it("states the token estimate when the list answers by token cost", () => {
    renderRow(installed, "tokens");
    // The trigger keeps the rail's shared grammar — icon over a bare figure —
    // and the accessible name spells the basis out. The count is the same
    // estimate the drawer states, computed here off the shared helper.
    expect(
      screen.getByText(String(estimateTokens(installed.description))),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/预估 Token 数/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^热度 /)).toBeNull();
    expect(screen.queryByLabelText(/^安装于 /)).toBeNull();
  });

  it("renders nothing in the slot when there is no description to cost", () => {
    // An empty description costs nothing to state; the slot stays silent
    // rather than printing a zero.
    renderRow({ ...installed, description: "" }, "tokens");
    expect(screen.queryByLabelText(/预估 Token 数/)).toBeNull();
  });
});

describe("the ordinal mark, shared with the repository card", () => {
  // The row is the reference shape: the card adopted the row's number rather
  // than inventing one, so this is where the shared mark is pinned. The two
  // surfaces are asserted against *each other* rather than against a class
  // string, because the claim is that there is only one mark — a copy of the
  // classes would satisfy a literal check while letting the two drift apart the
  // next time either surface is restyled.
  const row = { ...repoLive, name: "pdf", description: "A skill." };

  /** The card's bar leads with the ordinal; the row's gutter leads with it. */
  function cardOrdinal(container: HTMLElement): Element {
    return container.querySelector(
      '[data-slot="card-header"]',
    )!.firstElementChild!.firstElementChild!;
  }
  const rowOrdinal = (container: HTMLElement) =>
    container.querySelector("li span")!;

  const renderCard = (at: { index?: number } = { index: 0 }) =>
    renderWithRouter(
      <ul>
        <RepoCard
          repo="anthropics/skills"
          index={at.index}
          skills={[{ skill: row }]}
          onOpenSkill={() => {}}
        />
      </ul>,
    );

  it("is one mark, not two that look alike", () => {
    // Both surfaces at their defaults — a ranked row and a card that states its
    // place — so the whole class is the shared mark and nothing else: same box,
    // same scale, same ink, podium included. A future restyle of either surface
    // that touched the number would break this, which is the point: the two
    // shapes of one list must not drift apart, because the shape toggle is a view
    // choice and not a change to the list. A mark that appeared in one shape and
    // vanished in the other would tell the reader nothing.
    const { container: asRow } = renderRow(row);
    const { container: asCard } = renderCard();

    expect(cardOrdinal(asCard).className).toBe(rowOrdinal(asRow).className);
  });

  it("medals the leading three on the card, as the row does", () => {
    // The card orders by the stars its bar prints and prints them, which is the
    // row shape's own pattern — order by a figure, state it, and colour the top
    // three. So the first card wears gold exactly as the first row does, and the
    // ink is a position rather than a decoration that the view switch toggles.
    const { container: card1 } = renderCard({ index: 0 });
    const { container: card2 } = renderCard({ index: 1 });
    const { container: card4 } = renderCard({ index: 3 });
    const ink = (c: HTMLElement) => cardOrdinal(c).className;

    expect(ink(card1)).toContain(MEDAL_CLASSES[0]);
    expect(ink(card2)).toContain(MEDAL_CLASSES[1]);
    // Fourth place is out of the podium, in either shape.
    expect(ink(card4)).toContain("text-muted-foreground");
    for (const medal of MEDAL_CLASSES) {
      expect(ink(card4)).not.toContain(medal);
    }
  });

  it("is as wide as the card's owner face, so every card's name starts level", () => {
    // The alignment the fixed width buys on a card: the number's box and the
    // face's box are both 24px, so the repository name lands on one offset in
    // every card — including the source-less pool card, which leads with a name
    // where a repository leads with a face.
    const { container } = renderCard();

    const ordinal = cardOrdinal(container);
    expect(ordinal).toHaveTextContent("1");
    expect(ordinal).toHaveClass("w-6", "text-sm");
    const face = container.querySelector('[data-slot="avatar"]')!;
    expect(face).toHaveClass("size-6");
  });
});
