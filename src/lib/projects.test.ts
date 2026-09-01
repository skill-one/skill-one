import { describe, it, expect, beforeEach } from "vitest";

import {
  addProject,
  getProjectsSnapshot,
  listProjects,
  nameFromPath,
  removeProject,
  renameProject,
  resetProjects,
  subscribeProjects,
} from "./projects";

describe("nameFromPath", () => {
  it("takes the last non-empty segment", () => {
    expect(nameFromPath("/Users/me/work/demo-app")).toBe("demo-app");
    expect(nameFromPath("/Users/me/work/demo-app/")).toBe("demo-app");
    expect(nameFromPath("demo-app")).toBe("demo-app");
  });

  it("falls back to the whole path when the basename is empty", () => {
    expect(nameFromPath("/")).toBe("/");
  });
});

describe("projects store", () => {
  beforeEach(() => {
    resetProjects();
  });

  it("starts empty", () => {
    expect(listProjects()).toEqual([]);
  });

  it("adds a project, deriving its display name from the path", () => {
    const added = addProject("/home/user/code/app");
    expect(added).toEqual({ path: "/home/user/code/app", name: "app" });
    expect(listProjects()).toHaveLength(1);
  });

  it("de-duplicates by path (a repeat returns the existing project)", () => {
    addProject("/a/one");
    const again = addProject("/a/one");
    expect(again.name).toBe("one");
    expect(listProjects()).toHaveLength(1);
  });

  it("removes and renames a project", () => {
    addProject("/a/one");
    addProject("/b/two");
    renameProject("/a/one", "Renamed");
    expect(listProjects().find((p) => p.path === "/a/one")?.name).toBe("Renamed");
    removeProject("/b/two");
    expect(listProjects().map((p) => p.path)).toEqual(["/a/one"]);
  });

  it("ignores a blank rename", () => {
    addProject("/a/one");
    renameProject("/a/one", "   ");
    expect(listProjects()[0].name).toBe("one");
  });

  it("returns a stable snapshot reference until the next mutation", () => {
    addProject("/a/one");
    const first = getProjectsSnapshot();
    expect(getProjectsSnapshot()).toBe(first); // unchanged → same ref
    addProject("/b/two");
    expect(getProjectsSnapshot()).not.toBe(first); // changed → new ref
  });

  it("notifies subscribers on every mutation and stops after unsubscribe", () => {
    let calls = 0;
    const unsubscribe = subscribeProjects(() => calls++);
    addProject("/a/one");
    removeProject("/a/one");
    expect(calls).toBe(2);

    unsubscribe();
    addProject("/b/two");
    expect(calls).toBe(2);
  });
});
