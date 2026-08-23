import { describe, it, expect, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MySkillsPage } from "./my-skills-page";
import { renderWithRouter } from "../test/test-utils";
import { resetMockInstalledSkills } from "../lib/mock-local";

// The page reads installed skills through local-skills, which falls back to
// the mutable mock store in the browser (this test env), so mutations below
// actually change the data the page re-fetches after invalidate.

describe("MySkillsPage", () => {
  afterEach(() => {
    resetMockInstalledSkills();
  });

  it("renders the stats card with the installed count", async () => {
    renderWithRouter(<MySkillsPage />);

    // Wait for the (mock) query to land: 6 skills installed globally.
    expect(await screen.findByText("6")).toBeInTheDocument();
    expect(screen.getByText("已安装（全局）")).toBeInTheDocument();
  });

  it("renders each installed skill with its source", async () => {
    renderWithRouter(<MySkillsPage />);

    expect(await screen.findByText("pdf")).toBeInTheDocument();
    // 5 skills come from anthropics/skills, 1 from obra/superpowers.
    expect(screen.getAllByText("anthropics/skills")).toHaveLength(5);
    expect(screen.getByText("obra/superpowers")).toBeInTheDocument();
  });

  it("shows which agents a skill is linked to", async () => {
    renderWithRouter(<MySkillsPage />);

    // pdf is linked to claude-code in the mock store.
    expect(await screen.findByText(/已链接 claude-code/)).toBeInTheDocument();
  });

  it("removes a skill from the list and updates the stats", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);

    const removeButtons = await screen.findAllByTitle("移除");
    expect(removeButtons).toHaveLength(6);

    await user.click(removeButtons[0]); // pdf

    await waitFor(() => {
      expect(screen.queryByText("pdf")).not.toBeInTheDocument();
    });
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("shows the empty state after removing every skill", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MySkillsPage />);

    for (let remaining = 6; remaining > 0; remaining--) {
      const [first] = await screen.findAllByTitle("移除");
      await user.click(first);
      await waitFor(() => {
        expect(screen.queryAllByTitle("移除")).toHaveLength(remaining - 1);
      });
    }

    expect(
      await screen.findByText("还没有安装任何技能"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "去探索" })).toBeInTheDocument();
  });

  it("offers an update action per row", async () => {
    renderWithRouter(<MySkillsPage />);

    expect(await screen.findAllByTitle("更新")).toHaveLength(6);
  });
});
