import { describe, it, expect, afterEach } from "vitest";

import { isTauri } from "./tauri";

describe("isTauri", () => {
  afterEach(() => {
    // Restore the original window between cases.
    // @ts-expect-error deleting a non-optional property is intentional in tests
    delete window.__TAURI_INTERNALS__;
  });

  it("returns false when the Tauri internals are absent", () => {
    expect(isTauri()).toBe(false);
  });

  it("returns true when __TAURI_INTERNALS__ is present", () => {
    // @ts-expect-error test-only global injection
    window.__TAURI_INTERNALS__ = {};
    expect(isTauri()).toBe(true);
  });
});
