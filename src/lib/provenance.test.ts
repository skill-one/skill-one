import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  parseLedger,
  serializeLedger,
  recordSkillProvenance,
  recordSkillProvenanceBatch,
  reconcileProvenance,
  removeSkillProvenance,
  unlinkSkillSource,
  loadCustomTags,
  saveCustomTagDef,
  renameCustomTagDef,
  deleteCustomTagDef,
  setSkillTags,
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

    expect(parsed.config.version).toBe(1);
    expect(parsed.config.skills.pdf).toEqual({
      origin: "store",
      repo: "anthropics/skills",
      tags: ["文档处理", "办公"],
    });
    expect(parsed.config.skills["my-tool"]).toEqual({
      origin: "local",
      tags: ["自定义"],
    });
    expect(parsed.config.skills["find-skills"]).toEqual({
      origin: "local",
      repo: "vercel-labs/skills",
      tags: ["开发工具"],
    });
    expect(parsed.config.customTags).toHaveLength(2);

    // Backward-compatible maps
    expect(parsed.records.get("pdf")).toMatchObject({
      repo: "anthropics/skills",
      via: "install",
    });
    expect(parsed.records.get("find-skills")).toMatchObject({
      repo: "vercel-labs/skills",
      via: "confirm",
    });
    expect(parsed.tagDefs.get("frontend")?.label).toBe("💻 前端开发");
  });

  it("transparently migrates legacy JSONL format", () => {
    const legacy = [
      JSON.stringify({ kind: "meta", index: '"e1"' }),
      JSON.stringify({ kind: "source", name: "pdf", repo: "anthropics/skills", via: "install" }),
      JSON.stringify({ kind: "source", name: "find-skills", repo: "vercel-labs/skills", via: "confirm" }),
      JSON.stringify({ kind: "pending", name: "local-tool" }),
      JSON.stringify({ kind: "tag-def", key: "frontend", label: "前端开发" }),
      JSON.stringify({ kind: "skill-tag", name: "pdf", tag: "frontend" }),
    ].join("\n");

    const parsed = parseLedger(legacy);
    expect(parsed.config.skills.pdf).toEqual({
      origin: "store",
      repo: "anthropics/skills",
      tags: ["frontend"],
    });
    expect(parsed.config.skills["find-skills"]).toEqual({
      origin: "local",
      repo: "vercel-labs/skills",
    });
    expect(parsed.config.skills["local-tool"]).toEqual({
      origin: "local",
    });
    expect(parsed.config.customTags).toEqual([{ key: "frontend", label: "前端开发" }]);
  });

  it.each([
    ["null", null],
    ["an empty string", ""],
    ["truncated JSON", "not json {"],
  ] as const)("returns an empty ledger for %s", (_label, raw) => {
    expect(parseLedger(raw).records.size).toBe(0);
    expect(parseLedger(raw).config.skills).toEqual({});
  });

  it("skips broken lines during legacy migration and keeps valid ones", () => {
    const raw = [
      JSON.stringify({ kind: "source", name: "pdf", repo: "anthropics/skills", via: "install" }),
      "{broken json",
      "random garbage",
      JSON.stringify({ kind: "tag-def", key: "custom", label: "Custom" }),
    ].join("\n");

    const parsed = parseLedger(raw);
    expect(parsed.config.skills.pdf?.repo).toBe("anthropics/skills");
    expect(parsed.config.customTags).toEqual([{ key: "custom", label: "Custom" }]);
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
    expect(parsed.config).toEqual(SAMPLE_CONFIG);
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
});
