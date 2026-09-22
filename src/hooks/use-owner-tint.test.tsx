import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { useOwnerTint } from "./use-owner-tint";
import { resetOwnerTints } from "../lib/owner-tint";

/**
 * What the hook owes a card: a value to render right now — null, the plain
 * chrome — and a re-render of the cards that asked for *this* owner if a colour
 * arrives later.
 */

vi.mock("../lib/avatar-source", () => ({
  avatarCandidates: (owner: string) => [`https://cdn.test/${owner}.png`],
}));

vi.mock("fast-average-color", () => ({
  FastAverageColor: class {
    async getColorAsync() {
      return { hex: "#3b82f6" };
    }
  },
}));

/** Prints the tint it is handed, so a late arrival is visible in the DOM. */
function Probe({ owner }: { owner: string }) {
  const tint = useOwnerTint(owner);
  return <span data-testid="tint">{tint ?? "none"}</span>;
}

beforeEach(() => {
  resetOwnerTints();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob() })));
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ close() {} })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useOwnerTint", () => {
  it("starts neutral and gains the owner's colour when it arrives", async () => {
    render(<Probe owner="anthropics" />);

    // The first paint is the neutral one: a card never waits for its decoration.
    expect(screen.getByTestId("tint")).toHaveTextContent("none");

    await waitFor(() =>
      expect(screen.getByTestId("tint")).toHaveTextContent("#3b82f6"),
    );
  });

  it("leaves a card with no owner at all neutral", () => {
    render(<Probe owner="" />);

    expect(screen.getByTestId("tint")).toHaveTextContent("none");
    expect(fetch).not.toHaveBeenCalled();
  });
});
