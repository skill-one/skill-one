import { describe, it, expect } from "vitest";

import { classifySkills, parseStrays } from "./link-migration";

// The reason strings below are the four shapes produced by `link_agent` in the
// `agents-skills` crate, reproduced verbatim apart from the paths.
const AGENT_DIR = "/Users/me/.cursor/skills";
const CANONICAL = "/Users/me/.agents/skills";

describe("parseStrays", () => {
  it("returns nothing when only skills are present", () => {
    const message = `${AGENT_DIR} has existing skills; rerun with --migrate to move them into ${CANONICAL}`;
    expect(parseStrays(message, ["pdf", "xlsx"])).toEqual([]);
  });

  it("reads the files listed alongside skills", () => {
    const message = `${AGENT_DIR} has existing skills and non-skill files; remove the files (README.md, notes.txt), then rerun with --migrate`;
    expect(parseStrays(message, ["pdf"])).toEqual(["README.md", "notes.txt"]);
  });

  it("reads the files listed when no skills were found", () => {
    const message = `${AGENT_DIR} contains non-skill files; move them out and rerun (migrate only moves skill directories): README.md, notes.txt`;
    expect(parseStrays(message, [])).toEqual(["README.md", "notes.txt"]);
  });

  it("does not mistake the parenthesised clause for the file list", () => {
    const message = `${AGENT_DIR} contains non-skill files; move them out and rerun (migrate only moves skill directories): README.md`;
    expect(parseStrays(message, [])).toEqual(["README.md"]);
  });

  it("returns nothing for existing content that is neither skill nor file", () => {
    const message = `${AGENT_DIR} has existing content; rerun with --migrate to move it into ${CANONICAL}`;
    expect(parseStrays(message, [])).toEqual([]);
  });

  it("handles a missing reason", () => {
    expect(parseStrays(null, ["pdf"])).toEqual([]);
    expect(parseStrays(undefined, [])).toEqual([]);
    expect(parseStrays("", [])).toEqual([]);
  });

  it("ignores an unrecognised reason", () => {
    expect(parseStrays("something else entirely", ["pdf"])).toEqual([]);
    expect(parseStrays("something else entirely", [])).toEqual([]);
  });
});

describe("classifySkills", () => {
  it("marks nothing as skipped when the canonical dir is empty", () => {
    expect(classifySkills(["pdf", "xlsx"], [])).toEqual([
      { name: "pdf", skipped: false },
      { name: "xlsx", skipped: false },
    ]);
  });

  it("marks skills the canonical dir already provides", () => {
    expect(classifySkills(["pdf", "xlsx"], ["xlsx", "docx"])).toEqual([
      { name: "pdf", skipped: false },
      { name: "xlsx", skipped: true },
    ]);
  });

  it("preserves the incoming order", () => {
    const result = classifySkills(["c", "a", "b"], ["a"]);
    expect(result.map((skill) => skill.name)).toEqual(["c", "a", "b"]);
  });

  it("handles an empty skill list", () => {
    expect(classifySkills([], ["pdf"])).toEqual([]);
  });
});
