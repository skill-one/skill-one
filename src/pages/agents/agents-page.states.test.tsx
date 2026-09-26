import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";

import { renderWithRouter } from "../../test/test-utils";
import { fetchAgentStatus } from "../../lib/local-skills";
import { AgentsPage } from "./agents-page";

// The main page test drives the browser mock; this file pins the two edge
// states (nothing detected, read failed) by controlling the query directly.
vi.mock("../../lib/local-skills", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../lib/local-skills")>();
  return { ...actual, fetchAgentStatus: vi.fn() };
});

const fetchMock = vi.mocked(fetchAgentStatus);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgentsPage edge states", () => {
  it("shows the empty state when no agent is detected", async () => {
    fetchMock.mockResolvedValue([]);
    renderWithRouter(<AgentsPage />, { route: "/my-skills/agents" });
    expect(
      await screen.findByText("未检测到可用的 agent"),
    ).toBeInTheDocument();
  });

  it("shows why the agent list could not be loaded", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));
    renderWithRouter(<AgentsPage />, { route: "/my-skills/agents" });
    expect(await screen.findByText(/加载失败/)).toBeInTheDocument();
  });
});
