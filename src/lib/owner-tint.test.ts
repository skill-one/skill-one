import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensureOwnerTint,
  getOwnerTint,
  readOwnerTint,
  resetOwnerTints,
  subscribeOwnerTints,
} from "./owner-tint";

/**
 * The avatar sources are `avatar-source.test.ts`'s subject; here they only have
 * to be two URLs in a fixed order, so a test can say which one answered.
 */
vi.mock("./avatar-source", () => ({
  avatarCandidates: (owner: string) => [
    `https://cdn.test/${owner}.png`,
    `https://github.com/${owner}.png`,
  ],
}));

/** The averaging itself is the library's subject, so the colour is stubbed. */
vi.mock("fast-average-color", () => ({
  FastAverageColor: class {
    async getColorAsync() {
      return { hex: "#3b82f6" };
    }
  },
}));

const COLOUR = "#3b82f6";
const OWNER = "anthropics";

/** A fetch that answers with the given sequence, repeating its last answer. */
function responders(...answers: Array<"ok" | "miss" | "throw">) {
  let call = 0;
  const fetchMock = vi.fn(async (_url: string) => {
    const answer = answers[Math.min(call++, answers.length - 1)] ?? "miss";
    if (answer === "throw") throw new Error("network");
    if (answer === "miss") return { ok: false } as Response;
    return { ok: true, blob: async () => new Blob() } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A decoded bitmap with the one method the reader is expected to call. */
function stubDecoding() {
  const close = vi.fn();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ close })),
  );
  return close;
}

/** Let an idle-scheduled read run to completion. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  resetOwnerTints();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readOwnerTint", () => {
  it("takes the colour from the first source that answers, and frees it", async () => {
    const fetchMock = responders("miss", "ok");
    const close = stubDecoding();

    await expect(readOwnerTint(OWNER)).resolves.toBe(COLOUR);
    // The first source refused; the one behind it answered.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(`https://github.com/${OWNER}.png`);
    expect(close).toHaveBeenCalled();
  });

  it("gives up quietly when no source answers", async () => {
    const fetchMock = responders("throw", "miss");
    stubDecoding();

    await expect(readOwnerTint(OWNER)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up quietly when the bytes cannot be decoded", async () => {
    responders("ok");
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("not an image");
      }),
    );

    await expect(readOwnerTint(OWNER)).resolves.toBeNull();
  });

  it("asks nothing of a platform that cannot decode", async () => {
    const fetchMock = responders("ok");
    // jsdom, and any WebView under the floor this app supports: there are no
    // pixels to average, so there is no reason to spend a request finding out.
    vi.stubGlobal("createImageBitmap", undefined);

    await expect(readOwnerTint(OWNER)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("owner tints", () => {
  it("reads an owner once and hands the colour to its subscribers", async () => {
    const fetchMock = responders("ok");
    stubDecoding();
    const listener = vi.fn();
    subscribeOwnerTints(listener);

    expect(getOwnerTint(OWNER)).toBeNull();
    ensureOwnerTint(OWNER);
    // Idempotent while the read is in flight, and after it lands.
    ensureOwnerTint(OWNER);
    await settle();
    ensureOwnerTint(OWNER);

    expect(getOwnerTint(OWNER)).toBe(COLOUR);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not ask again for an owner that had no colour", async () => {
    const fetchMock = responders("miss");
    stubDecoding();
    const listener = vi.fn();
    subscribeOwnerTints(listener);

    ensureOwnerTint(OWNER);
    await settle();
    ensureOwnerTint(OWNER);
    await settle();

    // Both sources tried once and nothing to announce: a card keeps its plain
    // chrome, and scrolling past the same owner does not ask again.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(listener).not.toHaveBeenCalled();
    expect(getOwnerTint(OWNER)).toBeNull();
  });

  it("still reads on a platform without idle callbacks", async () => {
    responders("ok");
    stubDecoding();
    // The WebView floor this app supports has `requestIdleCallback`; a plain
    // test environment may not, and the read must not depend on it.
    vi.stubGlobal("requestIdleCallback", undefined);

    ensureOwnerTint(OWNER);
    await settle();

    expect(getOwnerTint(OWNER)).toBe(COLOUR);
  });

  it("keeps each owner's colour to itself", async () => {
    responders("ok");
    stubDecoding();

    ensureOwnerTint(OWNER);
    ensureOwnerTint("vercel-labs");
    await settle();

    expect(getOwnerTint(OWNER)).toBe(COLOUR);
    expect(getOwnerTint("vercel-labs")).toBe(COLOUR);
    expect(getOwnerTint("nobody")).toBeNull();
  });
});
