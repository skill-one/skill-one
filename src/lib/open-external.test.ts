import { beforeEach, describe, expect, it, vi } from "vitest";

import { openExternal } from "./open-external";

const { isTauri, openUrl } = vi.hoisted(() => ({
  isTauri: vi.fn(),
  openUrl: vi.fn(),
}));

vi.mock("./tauri", () => ({ isTauri }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));

/** `window.open`, which jsdom leaves stubbed but does not let a test read. */
const windowOpen = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("open", windowOpen);
  window.open = windowOpen;
});

describe("openExternal", () => {
  it("asks the opener plugin inside the desktop app", async () => {
    // Not a plain `target="_blank"` anchor: Tauri v2 silently drops those, so
    // the anchor branch below is a browser-only fallback.
    isTauri.mockReturnValue(true);

    await openExternal("https://example.com");

    expect(openUrl).toHaveBeenCalledExactlyOnceWith("https://example.com");
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it("opens a new tab in a browser instead", async () => {
    isTauri.mockReturnValue(false);

    await openExternal("https://example.com");

    expect(windowOpen).toHaveBeenCalledExactlyOnceWith(
      "https://example.com",
      "_blank",
      // Without these the opened page can reach back through `window.opener`.
      "noopener,noreferrer",
    );
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("rejects when the opener plugin fails, rather than swallowing it", async () => {
    // A dead external link is worth surfacing: the caller shows a message, and
    // silently doing nothing leaves the user on a button that looks broken.
    isTauri.mockReturnValue(true);
    openUrl.mockRejectedValue(new Error("no handler"));

    await expect(openExternal("https://example.com")).rejects.toThrow(
      "no handler",
    );
  });
});
