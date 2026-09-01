import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// Mutable so a single test can flip the Tauri/browser branch without
// re-mocking. vi.mock factories run before imports, hence vi.hoisted.
const { emitMock, tauri } = vi.hoisted(() => ({
  emitMock: vi.fn(() => Promise.resolve()),
  tauri: { inTauri: true },
}));

vi.mock("@tauri-apps/api/event", () => ({ emit: emitMock }));
vi.mock("../lib/tauri", () => ({ isTauri: () => tauri.inTauri }));

import {
  INSTALLED_SKILLS_QUERY_KEY,
  markSkillsChanged,
  notifySkillsChanged,
} from "./use-installed-skills";
import { SKILLS_CHANGED_EVENT } from "../popover/popover-events";

beforeEach(() => {
  emitMock.mockClear();
  tauri.inTauri = true;
});

describe("notifySkillsChanged", () => {
  it("broadcasts the skills-changed event inside Tauri", () => {
    notifySkillsChanged();
    expect(emitMock).toHaveBeenCalledWith(SKILLS_CHANGED_EVENT);
  });

  it("is a no-op in the browser", () => {
    tauri.inTauri = false;
    notifySkillsChanged();
    expect(emitMock).not.toHaveBeenCalled();
  });
});

describe("markSkillsChanged", () => {
  it("invalidates the local list and broadcasts to the other windows", async () => {
    const client = new QueryClient();
    const spy = vi
      .spyOn(client, "invalidateQueries")
      .mockImplementation(async () => {});

    await markSkillsChanged(client);

    expect(spy).toHaveBeenCalledWith({ queryKey: INSTALLED_SKILLS_QUERY_KEY });
    expect(emitMock).toHaveBeenCalledWith(SKILLS_CHANGED_EVENT);
  });
});
