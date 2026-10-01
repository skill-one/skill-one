import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getListView,
  resetListView,
  setQuery,
  setScope,
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
