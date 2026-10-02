import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { SkillRow } from "./skill-row";
import { TooltipProvider } from "../../components/ui/tooltip";
import { renderWithRouter } from "../../test/test-utils";
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

function renderRow(skill: SkillView, fact?: "popularity" | "installedAt") {
  return renderWithRouter(
    <TooltipProvider>
      <ul>
        <SkillRow skill={skill} index={0} fact={fact} onSelect={() => {}} />
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
});
