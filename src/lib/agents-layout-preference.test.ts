import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  vi,
} from "vitest";

const KEY = "skill-one.agentsLayout";

async function freshPreference() {
  vi.resetModules();
  return import("./agents-layout-preference");
}

describe("agents-layout-preference", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("defaults to the constellation", async () => {
    const { getAgentsLayout } = await freshPreference();
    expect(getAgentsLayout()).toBe("constellation");
  });

  it("persists the chosen layout", async () => {
    const { getAgentsLayout, setAgentsLayout } = await freshPreference();
    setAgentsLayout("columns");
    expect(window.localStorage.getItem(KEY)).toBe("columns");
    expect(getAgentsLayout()).toBe("columns");
  });

  it("ignores an unreadable value and keeps the default", async () => {
    window.localStorage.setItem(KEY, "mosaic");
    const { getAgentsLayout } = await freshPreference();
    expect(getAgentsLayout()).toBe("constellation");
  });
});
