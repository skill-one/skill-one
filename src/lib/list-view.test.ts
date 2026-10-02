import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getListView,
  resetListView,
  setQuery,
  setScope,
  setSort,
  setUnit,
  subscribeListView,
} from "./list-view";

beforeEach(() => {
  resetListView();
});

describe("list view", () => {
  /** A store rebuilt from scratch, reading whatever `localStorage` now says. */
  const freshListView = async () => {
    vi.resetModules();
    return import("./list-view");
  };

  it("starts with one empty query and both lists reading as skill rows", () => {
    expect(getListView()).toEqual({
      query: "",
      views: { store: { unit: "skill" }, installed: { unit: "skill" } },
    });
  });

  it("starts from each list's stored unit, ignoring an unreadable one", async () => {
    window.localStorage.setItem("skill-one.listUnit.store", "repo");
    window.localStorage.setItem("skill-one.listUnit.installed", "nonsense");

    const { getListView } = await freshListView();
    expect(getListView().views.store.unit).toBe("repo");
    expect(getListView().views.installed.unit).toBe("skill");
  });

  it("persists a unit choice under the list's own key", () => {
    setUnit("store", "repo");

    expect(window.localStorage.getItem("skill-one.listUnit.store")).toBe("repo");
    expect(window.localStorage.getItem("skill-one.listUnit.installed")).toBe(
      null,
    );
  });

  it("forgets both lists' units again, stored ones included", () => {
    setUnit("installed", "repo");
    resetListView();

    expect(getListView().views.installed.unit).toBe("skill");
    expect(window.localStorage.getItem("skill-one.listUnit.installed")).toBe(
      null,
    );
  });

  it("holds one query, not one per list", () => {
    setQuery("pdf");

    // Both lists read the same field, so both get the same answer to it — that
    // is the whole point of the shared query.
    expect(getListView().query).toBe("pdf");
    expect(getListView().views.store).not.toHaveProperty("query");
    expect(getListView().views.installed).not.toHaveProperty("query");
  });

  it("keeps each list's unit to itself", () => {
    setUnit("store", "repo");

    expect(getListView().views.store.unit).toBe("repo");
    expect(getListView().views.installed.unit).toBe("skill");
  });

  it("drops a list's scope when its unit changes", () => {
    // The two units file their taxonomies differently, so a scope read under
    // one may mean nothing under the other.
    setScope("store", "development");
    setUnit("store", "repo");

    expect(getListView().views.store).toEqual({ unit: "repo" });
  });

  it("keeps each list's scope to itself, and clears one with null", () => {
    setScope("store", "development");
    setScope("installed", "writing");
    expect(getListView().views.store.scope).toBe("development");
    expect(getListView().views.installed.scope).toBe("writing");

    setScope("store", null);
    expect(getListView().views.store).not.toHaveProperty("scope");
    expect(getListView().views.installed.scope).toBe("writing");
  });

  it("reads no sort until the reader picks one, and the default stays absent", () => {
    expect(getListView().views.installed).not.toHaveProperty("sort");

    setSort("installed", "installed");
    expect(getListView().views.installed.sort).toBe("installed");

    // Picking the default back removes it again, exactly as it is never stored.
    setSort("installed", "popularity");
    expect(getListView().views.installed).not.toHaveProperty("sort");
  });

  it("persists a sort choice under the list's own key, default excluded", () => {
    setSort("installed", "installed");
    expect(window.localStorage.getItem("skill-one.listSort.installed")).toBe(
      "installed",
    );

    setSort("installed", "popularity");
    expect(
      window.localStorage.getItem("skill-one.listSort.installed"),
    ).toBeNull();
  });

  it("starts from a stored sort, ignoring an unreadable one", async () => {
    window.localStorage.setItem("skill-one.listSort.installed", "installed");
    window.localStorage.setItem("skill-one.listSort.store", "nonsense");

    const { getListView: stored } = await freshListView();
    expect(stored().views.installed.sort).toBe("installed");
    expect(stored().views.store).not.toHaveProperty("sort");
  });

  it("reads the installed list's old unit choice as its repository sort", async () => {
    // A reader who had the installed list in repository cards keeps that
    // reading under the merged control's third sort.
    window.localStorage.setItem("skill-one.listUnit.installed", "repo");
    const { getListView: migrated } = await freshListView();
    expect(migrated().views.installed.sort).toBe("repo");

    // The store keeps its unit switch, so its stored unit is not a sort.
    window.localStorage.setItem("skill-one.listUnit.store", "repo");
    const { getListView: untouched } = await freshListView();
    expect(untouched().views.store).not.toHaveProperty("sort");
    expect(untouched().views.store.unit).toBe("repo");
  });

  it("keeps the sort through a unit switch and a scope change, then forgets it", () => {
    setSort("installed", "installed");
    setUnit("installed", "repo");
    expect(getListView().views.installed.sort).toBe("installed");

    setScope("installed", "development");
    expect(getListView().views.installed.sort).toBe("installed");

    resetListView();
    expect(getListView().views.installed).not.toHaveProperty("sort");
    expect(
      window.localStorage.getItem("skill-one.listSort.installed"),
    ).toBeNull();
  });

  it("notifies subscribers, and only when something moved", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeListView(listener);

    setQuery("pdf");
    expect(listener).toHaveBeenCalledTimes(1);
    setQuery("pdf");
    expect(listener).toHaveBeenCalledTimes(1);

    setUnit("store", "repo");
    expect(listener).toHaveBeenCalledTimes(2);

    setScope("store", "development");
    expect(listener).toHaveBeenCalledTimes(3);
    setScope("store", "development");
    expect(listener).toHaveBeenCalledTimes(3);

    setUnit("store", "skill");
    expect(listener).toHaveBeenCalledTimes(4);

    unsubscribe();
    resetListView();
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it("leaves the list that did not change referentially stable", () => {
    const before = getListView().views.installed;

    setUnit("store", "repo");
    setScope("store", "development");
    setQuery("pdf");

    // A control re-renders on every change; a list whose own view did not move
    // must not re-render its readers with it.
    expect(getListView().views.installed).toBe(before);
  });
});
