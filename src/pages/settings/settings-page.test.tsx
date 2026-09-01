import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ThemeProvider } from "../../components/theme-provider";
import { SettingsPage } from "./settings-page";

function renderSettings() {
  return render(
    <ThemeProvider>
      <SettingsPage />
    </ThemeProvider>,
  );
}

describe("SettingsPage", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
  });

  afterEach(() => {
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
  });

  it("hosts the appearance picker alongside the CDN settings", () => {
    renderSettings();

    expect(screen.getByText("外观")).toBeInTheDocument();
    expect(screen.getByText("CDN 基址")).toBeInTheDocument();
    expect(screen.getByText("跟随系统")).toBeInTheDocument();
  });

  it("shows the 软件更新 card with a manual check control", () => {
    renderSettings();

    expect(screen.getByText("软件更新")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "检查更新" }),
    ).toBeInTheDocument();
  });

  it("reports browser mode when checking updates outside Tauri", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: "检查更新" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "自动更新仅在桌面应用内可用。",
    );
  });

  it("switches the document to dark from the settings page", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByText("深色"));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
