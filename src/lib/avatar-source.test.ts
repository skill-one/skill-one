import { afterEach, describe, expect, it } from "vitest";

import { avatarCandidates } from "./avatar-source";
import { setCdnBase, setIndexTag } from "./cdn-config";

/**
 * The one answer to "where is an owner's avatar": the image a card draws and the
 * image its tint is read from both come from here, so a wrong list is either a
 * missing face or a card tinted by a picture it is not showing.
 */

afterEach(() => {
  setCdnBase("");
  setIndexTag("");
});

describe("avatarCandidates", () => {
  it("reads the mirror at the recorded snapshot tag, then GitHub itself", () => {
    setIndexTag("dist-2026-09-20-12");

    expect(avatarCandidates("anthropics")).toEqual([
      // Direct GitHub first, as every other file in the app is fetched.
      "https://raw.githubusercontent.com/skill-one/skills-profiles/dist-2026-09-20-12/upstream/avatars/anthropics.png",
      // …then the CDN mirror, pinned to the same immutable snapshot.
      "https://cdn.jsdmirror.com/gh/skill-one/skills-profiles@dist-2026-09-20-12/upstream/avatars/anthropics.png",
      // …and GitHub's own avatar endpoint last, for owners whose copy the
      // dataset missed.
      "https://github.com/anthropics.png",
    ]);
  });

  it("follows the mutable branch before any snapshot has been recorded", () => {
    setIndexTag("");

    expect(avatarCandidates("acme")[0]).toBe(
      "https://raw.githubusercontent.com/skill-one/skills-profiles/dist/upstream/avatars/acme.png",
    );
  });

  it("tries a configured CDN base first", () => {
    setCdnBase("https://my.mirror");

    expect(avatarCandidates("acme")[0]).toBe(
      "https://my.mirror/gh/skill-one/skills-profiles@dist/upstream/avatars/acme.png",
    );
  });
});
