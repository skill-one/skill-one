import { describe, expect, it } from "vitest";

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

function renderRow(skill: SkillView) {
  return renderWithRouter(
    <TooltipProvider>
      <ul>
        <SkillRow skill={skill} index={0} onSelect={() => {}} />
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
