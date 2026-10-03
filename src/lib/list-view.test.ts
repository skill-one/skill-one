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

  it("starts with one empty query and both lists answering by popularity", () => {
    // The default stays absent from the view, so a fresh list reads exactly
    // as it did before the sort control existed.
    expect(getListView()).toEqual({
      query: "",
      views: { store: {}, installed: {} },
    });
  });

  it("holds one query, not one per list", () => {
    setQuery("pdf");

    // Both lists read the same field, so both get the same answer to it — that
    // is the whole point of the shared query.
    expect(getListView().query).toBe("pdf");
    expect(getListView().views.store).not.toHaveProperty("query");
    expect(getListView().views.installed).not.toHaveProperty("query");
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

  it("keeps each list's shape to itself", () => {
    setUnit("store", "repo");

    expect(getListView().views.store.unit).toBe("repo");
    expect(getListView().views.installed).not.toHaveProperty("unit");
  });

  it("reads the shape as its own answer, default excluded", () => {
    expect(getListView().views.installed).not.toHaveProperty("unit");

    setUnit("installed", "repo");
    expect(getListView().views.installed.unit).toBe("repo");
    expect(window.localStorage.getItem("skill-one.listUnit.installed")).toBe(
      "repo",
    );

    // A card is a choice about the screen, not a ranking, so it is written
    // under its own key and the default shape leaves none behind.
    setUnit("installed", "skill");
    expect(getListView().views.installed).not.toHaveProperty("unit");
    expect(
      window.localStorage.getItem("skill-one.listUnit.installed"),
    ).toBeNull();
  });

  it("refuses a sort the list does not answer in", () => {
    // The store's menu never offers the install clock — it has no install of
    // its own to read by — so only a hand-built call could ask for one.
    setSort("store", "installed");
    expect(getListView().views.store).toEqual({});
  });

  it("refuses the shape the sort used to carry", () => {
    // "按仓库" was never an order: it said how many rows, not which came first.
    // A caller reaching for it as a sort gets nothing rather than a silent
    // change of shape.
    setSort("installed", "repo" as never);
    expect(getListView().views.installed).toEqual({});
  });

  it("starts from a stored sort, ignoring one the list cannot answer", async () => {
    window.localStorage.setItem("skill-one.listSort.installed", "installed");
    window.localStorage.setItem("skill-one.listSort.store", "nonsense");

    const { getListView: stored } = await freshListView();
    expect(stored().views.installed.sort).toBe("installed");
    expect(stored().views.store).not.toHaveProperty("sort");
  });

  it("reads a stored shape from its own key", async () => {
    window.localStorage.setItem("skill-one.listUnit.installed", "repo");
    const { getListView: stored } = await freshListView();
    expect(stored().views.installed.unit).toBe("repo");
    expect(stored().views.installed).not.toHaveProperty("sort");
  });

  it("keeps the sort through a scope change, then forgets it on reset", () => {
    setSort("installed", "installed");
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

    setSort("store", "popularity");
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
