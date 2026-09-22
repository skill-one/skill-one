import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useNavigate } from "react-router";

import { useReturn } from "./use-return";

/** The browser fact `useReturn` reads: react-router keeps its own index in the
 *  entry's state, and 0 (or nothing at all) is a window that never navigated. */
function windowHasEntryBehind(has: boolean) {
  window.history.replaceState({ idx: has ? 1 : 0, key: "behind" }, "");
}

/** The list the control returns to, with a back control of its own — the
 *  browser's own back button, as far as the router is concerned. */
function ListPage() {
  const navigate = useNavigate();
  return (
    <div>
      list page
      <button type="button" onClick={() => navigate(-1)}>
        再返回
      </button>
    </div>
  );
}

function Drill() {
  const back = useReturn("/list");
  return (
    <div>
      <Link to={back.to} onClick={back.onClick}>
        返回
      </Link>
    </div>
  );
}

/** A window whose stack is `entries`, the drill-down on top. */
function renderAt(entries: string[]) {
  render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="/list" element={<ListPage />} />
        <Route path="/detail" element={<Drill />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("useReturn", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", window.location.href);
  });

  it("pops the entry the reader came from, rather than a copy of its path", async () => {
    const user = userEvent.setup();
    windowHasEntryBehind(true);
    renderAt(["/list", "/detail"]);

    await user.click(screen.getByRole("link", { name: "返回" }));

    // The list is back...
    expect(await screen.findByText("list page")).toBeInTheDocument();
    // ...and the entry behind the reader *is* the list they left: going back
    // again goes nowhere, rather than into the page they just came from. A
    // pushed copy would put the drill-down back on the stack, one step behind
    // them.
    await user.click(screen.getByRole("button", { name: "再返回" }));
    expect(screen.getByText("list page")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "返回" })).not.toBeInTheDocument();
  });

  it("replaces itself when there is nothing behind it", async () => {
    const user = userEvent.setup();
    // A cold start on a deep link: the window has never navigated.
    windowHasEntryBehind(false);
    renderAt(["/detail"]);

    await user.click(screen.getByRole("link", { name: "返回" }));

    expect(await screen.findByText("list page")).toBeInTheDocument();
    // Replaced, not pushed: the page the reader never asked for is not left
    // behind them, so going back from the list goes nowhere at all.
    await user.click(screen.getByRole("button", { name: "再返回" }));
    expect(screen.getByText("list page")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "返回" })).not.toBeInTheDocument();
  });

  it("leaves a modified click to the browser", async () => {
    const user = userEvent.setup();
    windowHasEntryBehind(true);
    renderAt(["/list", "/detail"]);

    // ⌘-click asks for another window, not for this one to move — and the
    // handler must not swallow it before the browser has seen it.
    await user.keyboard("{Meta>}");
    await user.click(screen.getByRole("link", { name: "返回" }));
    await user.keyboard("{/Meta}");

    expect(screen.getByRole("link", { name: "返回" })).toBeInTheDocument();
    expect(screen.queryByText("list page")).not.toBeInTheDocument();
  });
});
