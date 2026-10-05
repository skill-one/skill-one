import { describe, it, expect, afterEach, vi } from "vitest";

import { isTauri, isMacOS, isWindows, isLinux } from "./tauri";

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

describe("platform detection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects macOS platform", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" });
    expect(isMacOS()).toBe(true);
    expect(isWindows()).toBe(false);
    expect(isLinux()).toBe(false);
  });

  it("detects Windows platform", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" });
    expect(isMacOS()).toBe(false);
    expect(isWindows()).toBe(true);
    expect(isLinux()).toBe(false);
  });

  it("detects Linux platform", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (X11; Linux x86_64)" });
    expect(isMacOS()).toBe(false);
    expect(isWindows()).toBe(false);
    expect(isLinux()).toBe(true);
  });
});

