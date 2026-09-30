import { describe, it, expect } from "vitest";

import type { InstalledSkill } from "./skills-manager";
import type { Skill } from "../types/skill";
import { installedSkillView, isInstallableSkill } from "./skill-view";

/** One entry of the installed list, as the backend reports it. */
const installedPdf: InstalledSkill = {
  name: "pdf",
  enabled: true,
  description: "Read and merge PDF documents.",
};

/** The registry entry the ledger's source resolves to. */
const entry: Skill = {
  name: "pdf",
  repo: "anthropics/skills",
  description: "Read and merge PDF documents.",
  stars: 169600,
  downloads: 2991984,
  path: "skills/anthropics/skills/pdf",
  url: "https://www.skills.sh/anthropics/skills/pdf",
};

describe("installedSkillView", () => {
  it("keeps path undefined and carries the snapshot directory separately", () => {
    const view = installedSkillView(installedPdf, {}, entry);
    // `path` undefined is what makes the panel read the SKILL.md off disk —
    // the copy the user actually has.
    expect(view.path).toBeUndefined();
    expect(view.snapshotPath).toBe("skills/anthropics/skills/pdf");
  });

  it("carries the registry entry's facts an on-disk record never has", () => {
    const view = installedSkillView(installedPdf, {}, entry);
    expect(view.storeBacked).toBe(true);
    expect(view.stars).toBe(169600);
    expect(view.downloads).toBe(2991984);
  });

  it("carries no store backing without a resolved entry", () => {
    const view = installedSkillView(installedPdf);
    expect(view.storeBacked).toBe(false);
    expect(view.snapshotPath).toBeUndefined();
  });
});

describe("isInstallableSkill", () => {
  /** A live skills.sh hit sourced from a GitHub repository. */
  const repoLive: Skill = {
    name: "find-skills",
    repo: "vercel-labs/skills",
    description: "",
    stars: 0,
    downloads: 100,
  };

  it("offers the install action on a store row", () => {
    expect(isInstallableSkill({ ...entry, storeBacked: true })).toBe(true);
  });

  it("keeps the action on an installed row the store cannot resolve", () => {
    // The button is the 已安装 fact about this machine there, not an
    // invitation — it must survive whatever the ledger can vouch for.
    const unbacked = installedSkillView(installedPdf);
    expect(isInstallableSkill(unbacked)).toBe(true);
  });

  it("offers the action on a live hit a GitHub id can be rebuilt for", () => {
    expect(isInstallableSkill({ ...repoLive, storeBacked: false })).toBe(true);
  });

  it("withholds the action from a live hit sourced from a discovery domain", () => {
    // `open.feishu.cn/lark-skill-maker` is not an `owner/repo/slug` id —
    // agents-skills can only refuse it.
    const domainLive: Skill = { ...repoLive, repo: "open.feishu.cn" };
    expect(isInstallableSkill({ ...domainLive, storeBacked: false })).toBe(
      false,
    );
  });

  it("withholds the action from a live hit with a dotted owner", () => {
    // A dotted first segment is a domain, not a GitHub user.
    const dotted: Skill = { ...repoLive, repo: "a.b/repo" };
    expect(isInstallableSkill({ ...dotted, storeBacked: false })).toBe(false);
  });
});
