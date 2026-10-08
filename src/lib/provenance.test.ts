import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  parseLedger,
  serializeLedger,
  recordSkillProvenance,
  recordSkillProvenanceBatch,
  reconcileProvenance,
  removeSkillProvenance,
  unlinkSkillSource,
  markSkillUnlinked,
  loadCustomTags,
  saveCustomTagDef,
  renameCustomTagDef,
  deleteCustomTagDef,
  setSkillTags,
  setManySkillTags,
  ledgerLines,
  readLedgerRaw,
  resetMockProvenance,
  seedMockLedgerRaw,
  seedMockProvenance,
  type SkillOneConfig,
} from "./provenance";

const SAMPLE_CONFIG: SkillOneConfig = {
  version: 1,
  skills: {
    pdf: {
      origin: "store",
      repo: "anthropics/skills",
      tags: ["文档处理", "办公"],
    },
    "my-tool": {
      origin: "local",
      tags: ["自定义"],
    },
    "find-skills": {
      origin: "local",
      repo: "vercel-labs/skills",
      tags: ["开发工具"],
    },
  },
  customTags: [
    { key: "custom", label: "自定义" },
    { key: "frontend", label: "💻 前端开发" },
  ],
};

describe("parseLedger", () => {
  it("parses new .skill-one.json format", () => {
    const raw = JSON.stringify(SAMPLE_CONFIG, null, 2);
    const parsed = parseLedger(raw);

    expect(parsed.version).toBe(1);
    expect(parsed.skills.pdf).toEqual({
      origin: "store",
      repo: "anthropics/skills",
      tags: ["文档处理", "办公"],
    });
    expect(parsed.skills["my-tool"]).toEqual({
      origin: "local",
      tags: ["自定义"],
    });
    expect(parsed.skills["find-skills"]).toEqual({
      origin: "local",
      repo: "vercel-labs/skills",
      tags: ["开发工具"],
    });
    expect(parsed.customTags).toHaveLength(2);
  });

  it("parses new format even when repo or skill name contains 'kind'", () => {
    const configWithKind = {
      version: 1,
      skills: {
        "kind-checker": {
          origin: "local",
          repo: "kubernetes-sigs/kind",
          tags: ["kindness"],
        },
      },
      customTags: [{ key: "kindness", label: "Kindness" }],
    };
    const parsed = parseLedger(JSON.stringify(configWithKind, null, 2));
    expect(parsed.skills["kind-checker"]).toEqual({
      origin: "local",
      repo: "kubernetes-sigs/kind",
      tags: ["kindness"],
    });
  });

  it.each([
    ["null", null],
    ["an empty string", ""],
    ["truncated JSON", "not json {"],
  ] as const)("returns an empty ledger for %s", (_label, raw) => {
    expect(parseLedger(raw).skills).toEqual({});
  });
});

describe("serializeLedger", () => {
  it("serializes SkillOneConfig as indented JSON", () => {
    const json = serializeLedger(SAMPLE_CONFIG);
    expect(json).toContain('"version": 1');
    expect(json).toContain('"anthropics/skills"');
    expect(JSON.parse(json)).toEqual(SAMPLE_CONFIG);
  });

  it("round-trips through parseLedger and serializeLedger", () => {
    const json = serializeLedger(SAMPLE_CONFIG);
    const parsed = parseLedger(json);
    expect(parsed).toEqual(SAMPLE_CONFIG);
  });
});

describe("ledgerLines", () => {
  it("splits JSON config into structured items for developer dialog", () => {
    const raw = serializeLedger(SAMPLE_CONFIG);
    const lines = ledgerLines(raw);

    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]?.record).toMatchObject({ kind: "meta", version: 1 });
    const pdfLine = lines.find((l) => l.record?.name === "pdf");
    expect(pdfLine?.record).toMatchObject({
      name: "pdf",
      origin: "store",
      repo: "anthropics/skills",
      tags: ["文档处理", "办公"],
    });
  });

  it.each([
    ["null", null],
    ["an empty string", ""],
    ["whitespace only", "  \n  "],
  ] as const)("returns no lines for %s", (_label, raw) => {
    expect(ledgerLines(raw)).toEqual([]);
  });

  it("captures invalid JSON as broken line", () => {
    const lines = ledgerLines("{invalid-json");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.broken).toBe("{invalid-json");
  });
});

describe("readLedgerRaw", () => {
  beforeEach(() => resetMockProvenance());
  afterEach(() => resetMockProvenance());

  it("returns the stored ledger verbatim", async () => {
    const raw = serializeLedger(SAMPLE_CONFIG);
    seedMockLedgerRaw(raw);
    expect(await readLedgerRaw()).toBe(raw);
  });

  it("returns null when nothing is stored yet", async () => {
    expect(await readLedgerRaw()).toBeNull();
  });
});

describe("provenance browser store", () => {
  beforeEach(() => resetMockProvenance());
  afterEach(() => resetMockProvenance());

  it("round-trips a recorded install through the persisted ledger", async () => {
    await recordSkillProvenance("anthropics/skills", "pdf", "install", ["文档处理"]);

    const { sources } = await reconcileProvenance(["pdf"]);
    expect(sources.pdf).toEqual({
      origin: "store",
      repo: "anthropics/skills",
      tags: ["文档处理"],
      via: "install",
    });

    const raw = JSON.parse((await readLedgerRaw())!);
    expect(raw.skills.pdf).toEqual({
      origin: "store",
      repo: "anthropics/skills",
      tags: ["文档处理"],
    });
  });

  it("distinguishes store install from third-party linked skill", async () => {
    await recordSkillProvenance("anthropics/skills", "pdf", "install");
    await recordSkillProvenance("fork/skills", "tool", "confirm");

    const { sources } = await reconcileProvenance(["pdf", "tool"]);
    expect(sources.pdf?.origin).toBe("store");
    expect(sources.pdf?.via).toBe("install");

    expect(sources.tool?.origin).toBe("local");
    expect(sources.tool?.repo).toBe("fork/skills");
    expect(sources.tool?.via).toBe("confirm");
  });

  it("records batch installs and links", async () => {
    await recordSkillProvenanceBatch([
      { repo: "a/repo", name: "a", reason: "install" },
      { repo: "b/repo", name: "b", reason: "confirm" },
    ]);

    const { sources } = await reconcileProvenance(["a", "b"]);
    expect(sources.a?.origin).toBe("store");
    expect(sources.b?.origin).toBe("local");
    expect(sources.b?.repo).toBe("b/repo");
  });

  it("prunes uninstalled skills during reconcile", async () => {
    seedMockProvenance({ pdf: { repo: "anthropics/skills", origin: "store" } });

    const { sources } = await reconcileProvenance(["other"]);
    expect(sources.pdf).toBeUndefined();
    expect(sources.other).toBeUndefined();

    const raw = JSON.parse((await readLedgerRaw())!);
    expect(raw.skills.pdf).toBeUndefined();
    expect(raw.skills.other).toBeDefined();
    expect(raw.skills.other.origin).toBe("local");
  });

  it("unlinks skill source without deleting local skill record", async () => {
    await recordSkillProvenance("fork/skills", "tool", "confirm", ["开发"]);
    await unlinkSkillSource("tool");

    const { sources } = await reconcileProvenance(["tool"]);
    expect(sources.tool).toBeUndefined();

    const raw = JSON.parse((await readLedgerRaw())!);
    expect(raw.skills.tool).toEqual({
      origin: "local",
      tags: ["开发"],
    });
  });

  it("marks a skill as explicitly unlinked with repo empty string", async () => {
    await recordSkillProvenance("fork/skills", "tool", "confirm", ["开发"]);
    await markSkillUnlinked("tool");

    const { sources, emptyRepos } = await reconcileProvenance(["tool"]);
    expect(sources.tool).toBeUndefined();
    expect(emptyRepos.has("tool")).toBe(true);

    const raw = JSON.parse((await readLedgerRaw())!);
    expect(raw.skills.tool).toEqual({
      origin: "local",
      repo: "",
      tags: ["开发"],
    });
  });

  it("forgets skill provenance on removal", async () => {
    await recordSkillProvenance("anthropics/skills", "pdf");
    await removeSkillProvenance("pdf");

    const { sources } = await reconcileProvenance(["other"]);
    expect(sources.pdf).toBeUndefined();
  });
});

describe("custom tags store", () => {
  beforeEach(() => resetMockProvenance());
  afterEach(() => resetMockProvenance());

  it("creates, renames and deletes label-only custom tags", async () => {
    await saveCustomTagDef("frontend", "💻 前端开发");
    expect(await loadCustomTags()).toEqual({
      tagDefs: [{ key: "frontend", label: "💻 前端开发" }],
      skillTags: {},
    });

    await renameCustomTagDef("frontend", "web", "Web 开发");
    expect(await loadCustomTags()).toEqual({
      tagDefs: [{ key: "web", label: "Web 开发" }],
      skillTags: {},
    });

    await deleteCustomTagDef("web");
    expect(await loadCustomTags()).toEqual({
      tagDefs: [],
      skillTags: {},
    });
  });

  it("supports multiple tags per skill", async () => {
    await recordSkillProvenance("anthropics/skills", "pdf", "install");
    await setSkillTags("pdf", ["办公", "文档", "常用"]);

    const { sources } = await reconcileProvenance(["pdf"]);
    expect(sources.pdf?.tags).toEqual(["办公", "文档", "常用"]);

    const custom = await loadCustomTags();
    expect(custom.skillTags.pdf).toBe("办公"); // First tag as backward-compatible single tag
  });

  it("deleting a tag definition removes it from assigned skills", async () => {
    await saveCustomTagDef("test-tag", "测试");
    await recordSkillProvenance("anthropics/skills", "pdf", "install");
    await setSkillTags("pdf", ["test-tag", "other-tag"]);

    await deleteCustomTagDef("test-tag");

    const { sources } = await reconcileProvenance(["pdf"]);
    expect(sources.pdf?.tags).toEqual(["other-tag"]);
  });

  it("sets multiple skill tags using object entries", async () => {
    await recordSkillProvenance("anthropics/skills", "pdf", "install");
    await setManySkillTags([
      { name: "pdf", tag: "工作" },
      { name: "other", tag: null },
    ]);
    const custom = await loadCustomTags();
    expect(custom.skillTags.pdf).toBe("工作");
  });
});
