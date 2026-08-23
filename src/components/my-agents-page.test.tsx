import { describe, it, expect, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MyAgentsPage } from "./my-agents-page";
import { renderWithRouter } from "../test/test-utils";
import { resetMockAgentStatus } from "../lib/mock-local";

// Agent status and link/unlink fall back to the mutable mock store in the
// browser, so clicking 链接 / 取消链接 changes the data the page re-reads.

describe("MyAgentsPage", () => {
  afterEach(() => {
    resetMockAgentStatus();
  });

  it("renders each agent with its link status", async () => {
    renderWithRouter(<MyAgentsPage />);

    expect(await screen.findByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Gemini CLI")).toBeInTheDocument();
    expect(screen.getByText("Windsurf")).toBeInTheDocument();

    // claude-code is linked, cursor/gemini-cli are not, windsurf is canonical.
    expect(screen.getAllByText("已链接")).toHaveLength(1);
    expect(screen.getAllByText("未链接")).toHaveLength(2);
    expect(screen.getByText("原生目录")).toBeInTheDocument();
  });

  it("links an unlinked agent", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MyAgentsPage />);

    // cursor and gemini-cli are the unlinked agents showing a 链接 button.
    const linkButtons = await screen.findAllByRole("button", { name: "链接" });
    expect(linkButtons).toHaveLength(2);

    await user.click(linkButtons[0]); // cursor

    await waitFor(() => {
      expect(screen.getAllByText("已链接")).toHaveLength(2);
      expect(screen.queryAllByRole("button", { name: "链接" })).toHaveLength(1);
    });
    expect(screen.getByText("Cursor（cursor） 已链接")).toBeInTheDocument();
  });

  it("unlinks a linked agent", async () => {
    const user = userEvent.setup();
    renderWithRouter(<MyAgentsPage />);

    // Only claude-code is linked (windsurf is canonical), so one 取消链接.
    const unlinkButtons = await screen.findAllByRole("button", {
      name: "取消链接",
    });
    expect(unlinkButtons).toHaveLength(1);

    await user.click(unlinkButtons[0]);

    await waitFor(() => {
      expect(screen.getAllByText("未链接")).toHaveLength(3);
      expect(
        screen.queryAllByRole("button", { name: "取消链接" }),
      ).toHaveLength(0);
    });
    expect(
      screen.getByText("Claude Code（claude-code） 已取消链接"),
    ).toBeInTheDocument();
  });

  it("shows no link action for canonical agents", async () => {
    renderWithRouter(<MyAgentsPage />);

    const windsurfName = await screen.findByText("Windsurf");
    const windsurfRow = windsurfName.closest("div.group");
    expect(windsurfRow).not.toBeNull();
    expect(
      within(windsurfRow as HTMLElement).queryByRole("button"),
    ).not.toBeInTheDocument();
  });
});
