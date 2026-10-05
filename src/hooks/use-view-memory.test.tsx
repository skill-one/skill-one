import { useRef, useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useNavigate } from "react-router";

import { resetViewMemories } from "../lib/view-memory";
import { useViewMemory } from "./use-view-memory";

/** The list this hook exists for: one control, one reveal depth, and its own
 *  scrolling element — the three things a page switch would otherwise take.
 *  The `name` and `signature` ride props so a test can mount the same page
 *  under another identity and check what the memory does about it. */
function ListPage({
  name = "probe",
  signature,
}: {
  name?: string;
  signature?: string;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useViewMemory(name, { text: "", depth: 1 }, scroller, {
    ready: true,
    signature,
  });

  return (
    <div>
      <input
        aria-label="搜索"
        value={view.text}
        onChange={(event) =>
          setView((v) => ({ ...v, text: event.target.value }))
        }
      />
      <button
        type="button"
        onClick={() => setView((v) => ({ ...v, depth: v.depth + 1 }))}
      >
        更深
      </button>
      <p>{`深度 ${view.depth}`}</p>
      <div ref={scroller} data-testid="scroller">
        {Array.from({ length: view.depth }, (_, i) => (
          <div key={i}>row {i}</div>
        ))}
      </div>
      <Link to="/detail">进入</Link>
    </div>
  );
}

/** A page whose content arrives late, the way a list's does. */
function ColdPage() {
  const [ready, setReady] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useViewMemory(
    "cold",
    { text: "", depth: 1 },
    scroller,
    { ready },
  );

  return (
    <div>
      <button type="button" onClick={() => setReady(true)}>
        内容就绪
      </button>
      <button
        type="button"
        onClick={() => setView((v) => ({ ...v, depth: v.depth + 1 }))}
      >
        更深
      </button>
      <p>{`深度 ${view.depth}`}</p>
      <div ref={scroller} data-testid="scroller">
        {Array.from({ length: view.depth }, (_, i) => (
          <div key={i}>row {i}</div>
        ))}
      </div>
      <Link to="/detail">进入</Link>
    </div>
  );
}

/** Where the drill-down lands; 返回 pops the entry it came from. */
function DetailPage() {
  const navigate = useNavigate();
  return (
    <div>
      <button type="button" onClick={() => navigate(-1)}>
        返回
      </button>
      <Link to="/list">新开</Link>
    </div>
  );
}

function renderRoutes(
  list: React.ReactNode = <ListPage />,
  entries: string[] = ["/list"],
) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="/list" element={list} />
        <Route path="/cold" element={<ColdPage />} />
        <Route path="/detail" element={<DetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function scrollTo(offset: number) {
  const scroller = screen.getByTestId("scroller");
  scroller.scrollTop = offset;
  fireEvent.scroll(scroller);
  return scroller;
}

describe("useViewMemory", () => {
  beforeEach(() => {
    resetViewMemories();
  });

  it("gives the reader their view back after a drill-down and back", async () => {
    const user = userEvent.setup();
    renderRoutes();

    await user.type(screen.getByRole("textbox", { name: "搜索" }), "pdf");
    await user.click(screen.getByRole("button", { name: "更深" }));
    await user.click(screen.getByRole("button", { name: "更深" }));
    scrollTo(240);
    expect(screen.getByText("深度 3")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "进入" }));
    // The page the reader left is gone: a fresh mount starts from nothing.
    expect(screen.queryByText("深度 3")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "返回" }));

    // The control, the reveal depth and the scroll position all come back —
    // together, and as the page's first paint rather than a catch-up.
    expect(await screen.findByRole("textbox", { name: "搜索" })).toHaveValue(
      "pdf",
    );
    expect(screen.getByText("深度 3")).toBeInTheDocument();
    expect(screen.getByTestId("scroller").scrollTop).toBe(240);
  });

  it("returns the reader to the remembered view on a fresh visit too", async () => {
    const user = userEvent.setup();
    renderRoutes();

    await user.type(screen.getByRole("textbox", { name: "搜索" }), "pdf");
    await user.click(screen.getByRole("button", { name: "更深" }));
    await user.click(screen.getByRole("link", { name: "进入" }));

    // 新开 pushes a new entry rather than popping the old one — the sidebar
    // way of coming back. The memory follows the page, not the entry, so the
    // view the reader left is what they land on, not a fresh one.
    await user.click(screen.getByRole("link", { name: "新开" }));

    expect(await screen.findByRole("textbox", { name: "搜索" })).toHaveValue(
      "pdf",
    );
    expect(screen.getByText("深度 2")).toBeInTheDocument();
  });

  it("keeps two pages' memories apart", async () => {
    const user = userEvent.setup();
    const { unmount } = renderRoutes();

    await user.type(screen.getByRole("textbox", { name: "搜索" }), "pdf");
    await user.click(screen.getByRole("link", { name: "进入" }));
    await user.click(screen.getByRole("link", { name: "新开" }));
    unmount();

    // The other list answers for itself: its name was never written to, so a
    // page switch hands it its own fresh view, not the first page's.
    renderRoutes(<ListPage name="other" />);
    expect(screen.getByRole("textbox", { name: "搜索" })).toHaveValue("");
    expect(screen.getByText("深度 1")).toBeInTheDocument();
  });

  it("drops a memory that no longer describes the answer", async () => {
    const user = userEvent.setup();
    const underA = renderRoutes(<ListPage signature="a" />);

    // The view is written under answer "a"...
    await user.type(screen.getByRole("textbox", { name: "搜索" }), "pdf");
    await user.click(screen.getByRole("button", { name: "更深" }));
    underA.unmount();

    // ...and a return under a different answer is not a place the reader was
    // ever at, so the memory stays out of the paint — and, being one view per
    // page, the slot now describes the answer that was last shown.
    const underB = renderRoutes(<ListPage signature="b" />);
    expect(screen.getByRole("textbox", { name: "搜索" })).toHaveValue("");
    expect(screen.getByText("深度 1")).toBeInTheDocument();
    underB.unmount();

    renderRoutes(<ListPage signature="a" />);
    expect(screen.getByRole("textbox", { name: "搜索" })).toHaveValue("");
    expect(screen.getByText("深度 1")).toBeInTheDocument();
  });

  it("holds the position until there is content to scroll", async () => {
    const user = userEvent.setup();
    renderRoutes(<ColdPage />, ["/cold"]);

    // A first visit scrolls the (empty, but real) list and reveals a second row.
    await user.click(screen.getByRole("button", { name: "更深" }));
    scrollTo(240);
    await user.click(screen.getByRole("link", { name: "进入" }));
    await user.click(screen.getByRole("button", { name: "返回" }));

    // The depth returns with the page, but the scroll does not: the list is
    // still a skeleton, and a position spent on a skeleton is spent on nothing.
    expect(await screen.findByText("深度 2")).toBeInTheDocument();
    expect(screen.getByTestId("scroller").scrollTop).toBe(0);

    // Once the list has content, the position lands — still before any paint.
    await user.click(screen.getByRole("button", { name: "内容就绪" }));
    expect(screen.getByTestId("scroller").scrollTop).toBe(240);
  });
});
