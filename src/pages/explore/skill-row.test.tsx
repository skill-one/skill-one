import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { SkillRow } from "./skill-row";
import { RepoCard } from "./repo-card";
import { TooltipProvider } from "../../components/ui/tooltip";
import { renderWithRouter } from "../../test/test-utils";
import { estimateTokens } from "../../lib/token-estimate";
import { MEDAL_CLASSES } from "../../lib/ordinal";
import type { SkillView } from "../../lib/skill-view";

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
