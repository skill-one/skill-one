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

  it("defaults to the columns", async () => {
    const { getAgentsLayout } = await freshPreference();
    expect(getAgentsLayout()).toBe("columns");
  });

  it("persists the chosen layout", async () => {
    const { getAgentsLayout, setAgentsLayout } = await freshPreference();
    setAgentsLayout("constellation");
    expect(window.localStorage.getItem(KEY)).toBe("constellation");
    expect(getAgentsLayout()).toBe("constellation");
  });

  it("ignores an unreadable value and keeps the default", async () => {
    window.localStorage.setItem(KEY, "mosaic");
    const { getAgentsLayout } = await freshPreference();
    expect(getAgentsLayout()).toBe("columns");
  });

  it("notifies subscribers on a change, until they unsubscribe", async () => {
    const { setAgentsLayout, subscribeAgentsLayout } =
      await freshPreference();
    const listener = vi.fn();
    const unsubscribe = subscribeAgentsLayout(listener);

    setAgentsLayout("constellation");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setAgentsLayout("columns");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
