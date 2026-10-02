import { afterEach, describe, expect, it } from "vitest";

import { avatarCandidates } from "./avatar-source";
import { setCdnBase } from "./cdn-config";

/**
 * The one answer to "where is an owner's avatar": every surface that draws a
 * face reads the same list, so a wrong list is a missing face everywhere at
 * once — and the chain has to survive both a configured mirror and direct
 * GitHub.
 */

afterEach(() => {
  setCdnBase("");
});

describe("avatarCandidates", () => {
  it("reads the snapshot's dist branch, then GitHub itself", () => {
    expect(avatarCandidates("anthropics")).toEqual([
      // Direct GitHub first, as every other file in the app is fetched.
      "https://raw.githubusercontent.com/skill-one/skills-profiles/dist/owners/anthropics.png",
      // …then the CDN mirror of the same branch.
      "https://cdn.jsdmirror.com/gh/skill-one/skills-profiles@dist/owners/anthropics.png",
      // …and GitHub's own avatar endpoint last, for owners whose copy the
      // dataset missed.
      "https://github.com/anthropics.png",
    ]);
  });

  it("tries a configured CDN base first", () => {
    setCdnBase("https://my.mirror");

    expect(avatarCandidates("acme")[0]).toBe(
      "https://my.mirror/gh/skill-one/skills-profiles@dist/owners/acme.png",
    );
  });
});
