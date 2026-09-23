import { beforeEach, describe, expect, it, vi } from "vitest";

import { storage } from "./storage";
import {
  DEFAULT_REPO_CARD_LIMIT,
  getRepoCardLimit,
  REPO_CARD_LIMITS,
  setRepoCardLimit,
  subscribeRepoCardLimit,
} from "./repo-card-preview";

const STORAGE_KEY = "skill-one.repoCardLimit";

describe("repo-card preview size", () => {
  beforeEach(() => {
    storage.removeItem(STORAGE_KEY);
  });

  it("offers 3/5/7 and defaults to five", () => {
    expect(REPO_CARD_LIMITS).toEqual([3, 5, 7]);
    expect(DEFAULT_REPO_CARD_LIMIT).toBe(5);
    expect(getRepoCardLimit()).toBe(5);
  });

  it("round-trips a chosen size", () => {
    setRepoCardLimit(7);
    expect(getRepoCardLimit()).toBe(7);
  });

  it("falls back to the default on an unoffered or unreadable value", () => {
    // A value the settings page never offers, and a payload that is not a
    // number at all, both read back as the default.
    storage.setItem(STORAGE_KEY, "9");
    expect(getRepoCardLimit()).toBe(5);
    storage.setItem(STORAGE_KEY, "not-a-number");
    expect(getRepoCardLimit()).toBe(5);
  });

  it("notifies subscribers on a change, until they unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRepoCardLimit(listener);

    setRepoCardLimit(3);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setRepoCardLimit(7);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
