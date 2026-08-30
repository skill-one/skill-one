import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { setTheme } = vi.hoisted(() => ({ setTheme: vi.fn() }));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setTheme }),
}));

import { useNativeTheme } from "./use-native-theme";

function setTauriRuntime(enabled: boolean) {
  if (enabled) {
    // @ts-expect-error test-only global injection
    window.__TAURI_INTERNALS__ = {};
  } else {
    // @ts-expect-error deleting a non-optional property is intentional in tests
    delete window.__TAURI_INTERNALS__;
  }
}

describe("useNativeTheme", () => {
  beforeEach(() => {
    setTheme.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    setTauriRuntime(false);
    vi.restoreAllMocks();
  });

  it("hands 'system' to Tauri as null so the OS drives the appearance", () => {
    setTauriRuntime(true);

    renderHook(() => useNativeTheme("system"));

    expect(setTheme).toHaveBeenCalledWith(null);
  });

  it("mirrors an explicit light/dark choice onto the native window", () => {
    setTauriRuntime(true);

    const { rerender } = renderHook((theme: string) => useNativeTheme(theme), {
      initialProps: "dark",
    });
    expect(setTheme).toHaveBeenLastCalledWith("dark");

    rerender("light");
    expect(setTheme).toHaveBeenLastCalledWith("light");
  });

  it("stays inert outside the Tauri webview", () => {
    renderHook(() => useNativeTheme("dark"));

    expect(setTheme).not.toHaveBeenCalled();
  });

  it("logs a native failure instead of breaking the render", async () => {
    setTauriRuntime(true);
    setTheme.mockRejectedValue(new Error("window gone"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    renderHook(() => useNativeTheme("dark"));

    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());
  });
});
