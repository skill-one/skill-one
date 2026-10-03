import { describe, it, expect } from "vitest";

import { splitByEnabled } from "./enabled-split";

/** One row as the installed list builds it: a switch and a name to read. */
interface Row {
  name: string;
  enabled: boolean;
}
const row = (name: string, enabled: boolean): Row => ({ name, enabled });
const isEnabled = (r: Row) => r.enabled;
const names = (rows: readonly Row[]) => rows.map((r) => r.name);

describe("splitByEnabled", () => {
  it("sinks the disabled rows however the list was ordered", () => {
    // Already in the chosen sort's order — popularity, say. The split is what
    // moves the parked rows off the top, not a re-sort.
    const sorted = [
      row("popular", true),
      row("also-popular", false),
      row("quiet", true),
      row("middling", false),
    ];
    const split = splitByEnabled(sorted, isEnabled);
    expect(names(split.enabled)).toEqual(["popular", "quiet"]);
    expect(names(split.disabled)).toEqual(["also-popular", "middling"]);
  });

  it("keeps each half in the order it arrived in", () => {
    // The property that lets the caller sort once and split once: neither half
    // is re-ordered, so the sort the reader picked is the order they still read.
    const rows = [row("c", true), row("b", false), row("a", true), row("z", false)];
    const split = splitByEnabled(rows, isEnabled);
    expect(names(split.enabled)).toEqual(["c", "a"]);
    expect(names(split.disabled)).toEqual(["b", "z"]);
  });

  it("holds for any comparator, because it reads order rather than making it", () => {
    // The same split over three differently-ordered lists — which is the point:
    // the invariant is a property of the pipeline, not of one comparator, so a
    // sort nobody thought about when the flag was added still sinks the tail.
    const descending = [row("a", true), row("b", false), row("c", true)];
    const ascending = [...descending].reverse();
    const interleaved = [row("x", false), row("y", true), row("z", false)];

    expect(names(splitByEnabled(descending, isEnabled).disabled)).toEqual(["b"]);
    expect(names(splitByEnabled(ascending, isEnabled).disabled)).toEqual(["b"]);
    expect(names(splitByEnabled(ascending, isEnabled).enabled)).toEqual(["c", "a"]);
    expect(names(splitByEnabled(interleaved, isEnabled).enabled)).toEqual(["y"]);
    expect(names(splitByEnabled(interleaved, isEnabled).disabled)).toEqual(["x", "z"]);
  });

  it("leaves an all-live list whole and reports an empty parked half", () => {
    const split = splitByEnabled([row("a", true), row("b", true)], isEnabled);
    expect(names(split.enabled)).toEqual(["a", "b"]);
    expect(split.disabled).toEqual([]);
  });

  it("leaves an all-parked list with nothing to draw above it", () => {
    const split = splitByEnabled([row("a", false), row("b", false)], isEnabled);
    expect(split.enabled).toEqual([]);
    expect(names(split.disabled)).toEqual(["a", "b"]);
  });

  it("splits an empty list into two empty halves", () => {
    const split = splitByEnabled([], isEnabled);
    expect(split).toEqual({ enabled: [], disabled: [] });
  });

  it("never loses or duplicates a row", () => {
    const rows = [
      row("a", true),
      row("b", false),
      row("c", true),
      row("d", false),
      row("e", true),
    ];
    const split = splitByEnabled(rows, isEnabled);
    expect([...split.enabled, ...split.disabled]).toHaveLength(rows.length);
    expect(new Set([...split.enabled, ...split.disabled])).toEqual(new Set(rows));
  });

  it("reads each row's own state once, in order", () => {
    // The predicate is the only per-row cost, so it is asked once per row and
    // never re-asked while rendering — a row whose switch flips mid-split would
    // otherwise land in a half that does not match the list it was read from.
    const seen: string[] = [];
    splitByEnabled([row("a", true), row("b", false)], (r) => {
      seen.push(r.name);
      return r.enabled;
    });
    expect(seen).toEqual(["a", "b"]);
  });

  it("reads the state off the row rather than a captured flag", () => {
    // The point of taking a predicate: the same split serves the installed
    // list's rows and anything else carrying a switch, with no shared shape
    // required — the predicate names the field, not a `Row`.
    const installs = [
      { name: "a", on: true },
      { name: "b", on: false },
    ];
    const split = splitByEnabled(installs, (install) => install.on);
    expect(split.enabled.map((install) => install.name)).toEqual(["a"]);
    expect(split.disabled.map((install) => install.name)).toEqual(["b"]);
  });
});
