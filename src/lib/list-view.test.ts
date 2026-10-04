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

  it("starts with both lists answering by popularity", () => {
    // The default stays absent from the view, so a fresh list reads exactly
    // as it did before the sort control existed — and a fresh list asks nothing:
    // the question is absent exactly as the default order is.
    expect(getListView()).toEqual({
      views: { store: {}, installed: {} },
    });
  });

  it("keeps each list's own question, and forgets an empty one", () => {
    setQuery("store", "pdf");
    setQuery("installed", "writer");

    // The two answers are two answers: the registry's index and this machine's
    // own installs. One shared field would mean a question asked on one list
    // silently re-answering the other.
    expect(getListView().views.store.query).toBe("pdf");
    expect(getListView().views.installed.query).toBe("writer");

    // Clearing the field asks nothing, and asks it as absent rather than as an
    // empty string the view would then have to keep special-casing.
    setQuery("store", "");
    expect(getListView().views.store).not.toHaveProperty("query");
    expect(getListView().views.installed.query).toBe("writer");
  });

  it("keeps a question through the shape, the scope and the order", () => {
    setQuery("installed", "pdf");

    setUnit("installed", "repo");
    setScope("installed", "development");
    setSort("installed", "installed");

    // One list's reading is one answer: which entries are on screen, how they
    // are made of, how they are narrowed and which way they read never come
    // apart from each other — nor from what the reader is looking for.
    expect(getListView().views.installed).toEqual({
      query: "pdf",
      sort: "installed",
      scope: "development",
      unit: "repo",
    });
  });

  it("keeps a question out of storage, and out of a fresh session's view", async () => {
    setQuery("store", "pdf");
    setUnit("store", "repo");

    // The shape and the order are choices about how a list reads tomorrow, so
    // they persist. A question asked is this visit's business — it leaves with
    // the session, and nothing under the list's keys records it.
    expect(window.localStorage.getItem("skill-one.listQuery.store")).toBeNull();
    expect(window.localStorage.getItem("skill-one.listUnit.store")).toBe("repo");

    const { getListView: stored } = await freshListView();
    expect(stored().views.store.unit).toBe("repo");
    expect(stored().views.store).not.toHaveProperty("query");
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

  it("persists the grid shape like the repository one, default excluded", async () => {
    setUnit("store", "grid");
    expect(getListView().views.store.unit).toBe("grid");
    expect(window.localStorage.getItem("skill-one.listUnit.store")).toBe(
      "grid",
    );

    setUnit("store", "skill");
    expect(getListView().views.store).not.toHaveProperty("unit");
    expect(window.localStorage.getItem("skill-one.listUnit.store")).toBeNull();

    window.localStorage.setItem("skill-one.listUnit.store", "grid");
    const { getListView: stored } = await freshListView();
    expect(stored().views.store.unit).toBe("grid");
  });

  it("reads an unknown stored shape as the default", async () => {
    window.localStorage.setItem("skill-one.listUnit.store", "masonry");
    const { getListView: stored } = await freshListView();
    expect(stored().views.store).not.toHaveProperty("unit");
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

    setUnit("store", "repo");
    expect(listener).toHaveBeenCalledTimes(1);
    setUnit("store", "repo");
    expect(listener).toHaveBeenCalledTimes(1);

    setScope("store", "development");
    expect(listener).toHaveBeenCalledTimes(2);
    setScope("store", "development");
    expect(listener).toHaveBeenCalledTimes(2);

    setSort("store", "popularity");
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    resetListView();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("leaves the list that did not change referentially stable", () => {
    const before = getListView().views.installed;

    setUnit("store", "repo");
    setScope("store", "development");

    // A control re-renders on every change; a list whose own view did not move
    // must not re-render its readers with it.
    expect(getListView().views.installed).toBe(before);
  });
});
