import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// The two writes this hook composes, plus the surface its toasts go to — the
// hook is the seam where "record the user's pick", "refresh everything that
// reads it" and "tell the user" meet, so that is what the cases below pin.
const { recordSkillProvenance, markSkillsChanged, toastAdd } = vi.hoisted(() => ({
  recordSkillProvenance: vi.fn(),
  markSkillsChanged: vi.fn(),
  toastAdd: vi.fn(),
}));

vi.mock("../lib/provenance", () => ({ recordSkillProvenance }));
vi.mock("./use-installed-skills", () => ({ markSkillsChanged }));
vi.mock("../components/ui/toast", () => ({ toast: { add: toastAdd } }));

import { useConfirmSkillSource } from "./use-confirm-skill-source";

/** Mount the hook on a client of its own, so invalidation cannot leak. */
function mount(name = "pdf") {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useConfirmSkillSource(name), { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  recordSkillProvenance.mockResolvedValue(undefined);
  markSkillsChanged.mockResolvedValue(undefined);
  toastAdd.mockReturnValue("toast-id");
});

describe("useConfirmSkillSource", () => {
  it("records the pick as a confirmation, then refreshes what reads it", async () => {
    const { result } = mount("pdf");

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.confirm("anthropics/skills");
    });

    expect(ok).toBe(true);
    // A confirmed pick is recorded like a native install: the user's choice is
    // the act of identification.
    expect(recordSkillProvenance).toHaveBeenCalledWith(
      "anthropics/skills",
      "pdf",
      "confirm",
    );
    // And the list and provenance map are invalidated with it, so the row, the
    // card and the drawer all redraw from the new record.
    expect(markSkillsChanged).toHaveBeenCalledTimes(1);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success" }),
    );
    await waitFor(() => expect(result.current.pendingRepo).toBeNull());
  });

  it("holds the repo in flight for as long as the write takes", async () => {
    let release: () => void = () => {};
    recordSkillProvenance.mockImplementation(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const { result } = mount();

    let pending: Promise<boolean> | undefined;
    act(() => {
      pending = result.current.confirm("anthropics/skills");
    });

    // The candidate row shows a spinner and every row is disabled meanwhile.
    await waitFor(() =>
      expect(result.current.pendingRepo).toBe("anthropics/skills"),
    );

    await act(async () => {
      release();
      await pending;
    });
    expect(result.current.pendingRepo).toBeNull();
  });

  it("reports failure instead of throwing, and leaves nothing pending", async () => {
    // The caller's decision — whether to close the popover — rides on the
    // return value, so a failed write must read as `false` rather than as an
    // exception each surface would have to catch itself.
    recordSkillProvenance.mockRejectedValue(new Error("disk full"));
    const { result } = mount();

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.confirm("anthropics/skills");
    });

    expect(ok).toBe(false);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
    // A failed write refreshes nothing: there is nothing new to read.
    expect(markSkillsChanged).not.toHaveBeenCalled();
    expect(result.current.pendingRepo).toBeNull();
  });
});
