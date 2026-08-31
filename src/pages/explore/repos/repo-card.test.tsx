import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

import type { RepoInfo } from "../../../lib/registry/protocol";
import { RepoCard } from "./repo-card";

const repo: RepoInfo = {
  repo: "acme/alpha",
  skills: 2,
  downloads: 80,
  stars: 10,
};

/** Captures the router location so tests can assert the navigation. */
let location: ReturnType<typeof useLocation> | null = null;
function LocationProbe() {
  location = useLocation();
  return null;
}

function renderCard() {
  location = null;
  return render(
    <MemoryRouter initialEntries={["/explore/repos"]}>
      <Routes>
        <Route path="/explore/repos" element={<RepoCard repo={repo} />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("RepoCard", () => {
  it("renders the repo name, header star count and skill count, but no downloads", () => {
    renderCard();

    expect(
      screen.getByRole("heading", { name: "acme/alpha" }),
    ).toBeInTheDocument();
    // The star count sits in the card header, next to the repo name.
    expect(screen.getByLabelText("Star 数 10")).toBeInTheDocument();
    expect(screen.getByText("个 Skill")).toBeInTheDocument();
    // The skill count renders as its own tabular span next to the label.
    expect(screen.getByText("2")).toBeInTheDocument();
    // The download count is intentionally not shown on repo cards.
    expect(screen.queryByText("80")).not.toBeInTheDocument();
  });

  it("navigates to the repo detail page on click", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(
      screen.getByRole("button", { name: "查看 acme/alpha 中的 Skill" }),
    );

    expect(location?.pathname).toBe("/explore/repos/acme/alpha");
  });

  it("navigates via Enter on the keyboard", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.tab(); // focus the card (it is the only tabbable element)
    await user.keyboard("{Enter}");

    expect(location?.pathname).toBe("/explore/repos/acme/alpha");
  });
});
