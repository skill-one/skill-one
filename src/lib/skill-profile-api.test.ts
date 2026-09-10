import { describe, expect, it, vi, afterEach } from "vitest";

import { fetchSkillProfile } from "./skill-profile-api";
import { setProfilesTag } from "./cdn-config";

const PATH = "skills/vercel-labs/skills/find-skills";

/** Serve per-path JSON from a fake origin; unknown paths answer 404. */
function serveFiles(files: Record<string, unknown>, status = 200) {
  return vi.fn(async (input: unknown) => {
    const url = String(input).replace(/\?.*$/, "");
    const body = Object.entries(files).find(([path]) =>
      url.endsWith(`/${path}`),
    )?.[1];
    if (body === undefined) return new Response("", { status: 404 });
    return new Response(JSON.stringify(body), { status });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  setProfilesTag("");
});

describe("fetchSkillProfile", () => {
  it("assembles the five angle files into one profile", async () => {
    vi.stubGlobal(
      "fetch",
      serveFiles({
        [`${PATH}/scenario.json`]: { text: "找不到现成 skill？它替你搜。" },
        [`${PATH}/tagline.json`]: { taglines: ["一搜即装", "只荐对的", "少走弯路"] },
        [`${PATH}/blackbox.json`]: {
          function: "把一句话需求变成装好的 skill。",
          input_output: [
            { input: "我想做 X", output: "推荐的 skill 与安装命令" },
          ],
        },
        [`${PATH}/whitebox.json`]: {
          execution_flow: ["拆解领域", "查排行榜", "给出候选"],
          mechanisms: ["两级查找", "三重质量闸"],
        },
        [`${PATH}/comments.json`]: {
          comments: [
            {
              user: "后端老兵",
              category: "妙用",
              comment: "用 --owner 锁定官方源。",
            },
          ],
        },
      }),
    );

    const profile = await fetchSkillProfile("find-skills", PATH);
    expect(profile.scenario).toBe("找不到现成 skill？它替你搜。");
    expect(profile.taglines).toEqual(["一搜即装", "只荐对的", "少走弯路"]);
    expect(profile.blackbox?.inputOutput).toEqual([
      { input: "我想做 X", output: "推荐的 skill 与安装命令" },
    ]);
    expect(profile.whitebox?.mechanisms).toEqual(["两级查找", "三重质量闸"]);
    expect(profile.comments?.[0]).toEqual({
      user: "后端老兵",
      category: "妙用",
      comment: "用 --owner 锁定官方源。",
    });
  });

  it("pins fetches to the recorded profiles tag", async () => {
    setProfilesTag("dist-2026-09-10-2");
    const fetchMock = serveFiles({ [`${PATH}/scenario.json`]: { text: "hi" } });
    vi.stubGlobal("fetch", fetchMock);

    await fetchSkillProfile("find-skills", PATH);

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.length).toBeGreaterThanOrEqual(5);
    for (const url of urls) {
      // The origin varies (raw GitHub vs the jsDelivr mirror, which pins
      // refs with `repo@tag`); the tag itself is what must be pinned.
      expect(url).toContain("dist-2026-09-10-2");
    }
    // The five angle files, one fetch each.
    for (const angle of [
      "scenario",
      "tagline",
      "blackbox",
      "whitebox",
      "comments",
    ]) {
      expect(urls.some((url) => url.includes(`/${angle}.json`))).toBe(true);
    }
  });

  it("drops a section whose file is missing, keeping the others", async () => {
    vi.stubGlobal(
      "fetch",
      serveFiles({
        // Only scenario answers; the other four candidates all 404.
        [`${PATH}/scenario.json`]: { text: "只有推介" },
      }),
    );

    const profile = await fetchSkillProfile("find-skills", PATH);
    expect(profile.scenario).toBe("只有推介");
    expect(profile.taglines).toBeUndefined();
    expect(profile.blackbox).toBeUndefined();
    expect(profile.whitebox).toBeUndefined();
    expect(profile.comments).toBeUndefined();
  });

  it("drops a section whose file is malformed or future-shaped", async () => {
    vi.stubGlobal(
      "fetch",
      serveFiles({
        [`${PATH}/scenario.json`]: { nope: true },
        [`${PATH}/tagline.json`]: { taglines: ["ok", "", 42] },
        [`${PATH}/blackbox.json`]: "not an object",
        [`${PATH}/whitebox.json`]: { execution_flow: "not a list" },
        [`${PATH}/comments.json`]: { comments: [{ user: "u" }] },
      }),
    );

    const profile = await fetchSkillProfile("find-skills", PATH);
    expect(profile).toEqual({});
  });

  it("rejects for a skill without a mirror path (local installs)", async () => {
    await expect(fetchSkillProfile("my-tool", undefined)).rejects.toThrow(
      /no mirror path/,
    );
  });
});
