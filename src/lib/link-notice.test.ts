import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";

import { formatLinkMessage, type Notice } from "./link-notice";
import type { AgentLinkResult } from "./skills-manager";

/**
 * A `t` that renders the key and the parameters it was handed, so a test can
 * read which message was chosen and what it was told — without depending on
 * the wording, which the locale tests own.
 */
const t = ((key: string, params?: Record<string, unknown>) => {
  const args = params
    ? Object.entries(params)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(",")
    : "";
  return args ? `${key}(${args})` : key;
}) as unknown as TFunction;

/** A link result with the given status, empty adoption lists and no message. */
const result = (
  status: AgentLinkResult["status"],
  extra: Partial<AgentLinkResult> = {},
): AgentLinkResult => ({
  agent: "cursor",
  display: "Cursor",
  status,
  adopted: [],
  quarantined: [],
  conflicts: [],
  // Required, and nullable rather than optional — a status that carries no
  // reason says so explicitly, which is what the fallbacks below rely on.
  message: null,
  ...extra,
});

/** The notice a result produces, or null when the status earns no toast. */
const notice = (
  r: AgentLinkResult | undefined,
): { kind: string; text: string } | null => {
  const n: Notice | null = formatLinkMessage(r);
  return n && { kind: n.kind, text: n.render(t) };
};

describe("formatLinkMessage", () => {
  it("says nothing when there is no result or an unknown status", () => {
    // A status this build does not know must not reach the user as a blank
    // toast, and must not reach the lookup as a crash either: a newer backend
    // paired with an older frontend is a real combination during a rollout.
    expect(notice(undefined)).toBeNull();
    expect(
      notice(result("somethingNewer" as AgentLinkResult["status"])),
    ).toBeNull();
  });

  // One table for both halves of the mapping. They used to be two tests — a
  // kind-per-status table and a separate loop asserting every status names the
  // agent — which walked the same seven rows twice to say two things per row.
  it.each([
    ["linked", "success"],
    ["alreadyLinked", "success"],
    ["skipped", "success"],
    ["unlinked", "success"],
    ["refused", "warning"],
    ["notLinked", "warning"],
    ["failed", "error"],
  ] as const)("reports %s as a %s notice that names the agent", (status, kind) => {
    const n = notice(result(status, { display: "Cursor" }));

    expect(n?.kind).toBe(kind);
    // The one line every status shares: a toast has to say which agent it is
    // about, or a link run over several agents is unreadable.
    expect(n?.text).toContain("Cursor");
  });

  describe("a link that moved things", () => {
    it("takes the short form when nothing was adopted, quarantined or dropped", () => {
      // The common case: the agent had nothing of its own, so there is no
      // detail clause to render.
      expect(notice(result("linked"))?.text).toBe("link.linked(name=Cursor)");
    });

    it("joins only the parts that have something in them", () => {
      // Each clause is conditional, so a result with two of the three lists
      // filled must not mention the empty one — a "0 quarantined" in a toast
      // reads as a claim that was never true.
      const text = notice(
        result("linked", { adopted: ["pdf"], quarantined: [] }),
      )?.text;
      expect(text).toContain("link.adopted(count=1)");
      expect(text).not.toContain("link.quarantined");
      expect(text).not.toContain("link.conflicts");
    });

    it("lists every part when the agent had all three", () => {
      const text = notice(
        result("linked", {
          adopted: ["pdf", "docx"],
          quarantined: ["notes.md"],
          conflicts: ["my-tool"],
        }),
      )?.text;

      expect(text).toContain("link.adopted(count=2)");
      expect(text).toContain("link.quarantined(count=1)");
      expect(text).toContain("link.conflicts(count=1)");
      expect(text).toContain("link.linkedWithDetail");
    });
  });

  it("falls back to a stated reason when a refusal carries none", () => {
    // A refusal with no message is still a refusal; "no reason given" is the
    // honest rendering, where an empty string would render as a blank toast.
    expect(notice(result("refused"))?.text).toContain("link.noReason");
    expect(notice(result("refused", { message: "not an agent dir" }))?.text)
      .toContain("not an agent dir");
  });

  it("falls back to a generic message when a failure carries none", () => {
    expect(notice(result("failed"))?.text).toContain("common.unknownError");
    expect(
      notice(result("failed", { message: "symlink denied" }))?.text,
    ).toContain("symlink denied");
  });

  it("reports an unlink as restoring nothing", () => {
    // Linking is one-way, so the unlink message must not imply the agent's
    // skills came back. Pinned because it is the one place a well-meaning
    // "restored" wording could quietly go in.
    const text = notice(result("unlinked"))?.text;
    expect(text).toContain("link.unlinked");
    expect(text).not.toContain("link.adopted");
  });
});
