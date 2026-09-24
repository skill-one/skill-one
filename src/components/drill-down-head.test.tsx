import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";

import { DrillDownHead } from "./drill-down-head";
import { TooltipProvider } from "./ui/tooltip";
import { renderWithRouter } from "../test/test-utils";

/**
 * The head as the app mounts it — one tooltip provider for the whole window,
 * and a list behind the page for the way back to land on (see `App.tsx`).
 */
function renderHead(
  props: Partial<Parameters<typeof DrillDownHead>[0]> = {},
) {
  return renderWithRouter(
    <TooltipProvider>
      <Routes>
        <Route
          path="/thing"
          element={
            <DrillDownHead
              back="/list"
              avatar={<span data-testid="face" />}
              title="acme/tools"
              meta="12 个 skill"
              action={<button type="button">在 GitHub 打开</button>}
              {...props}
            />
          }
        />
        <Route path="/list" element={<div>list</div>} />
      </Routes>
    </TooltipProvider>,
    { route: "/thing" },
  );
}

describe("DrillDownHead", () => {
  it("opens with the way back, then the entity, then the action", () => {
    renderHead();

    const back = screen.getByRole("link", { name: "返回" });
    const title = screen.getByRole("heading", { name: "acme/tools" });
    const action = screen.getByRole("button", { name: "在 GitHub 打开" });

    // Read left to right, the way the list below it is: out, then what this is,
    // then the one thing the reader can do to it.
    expect(
      back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      title.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The figures ride the name's own column, never a line of their own.
    expect(title.parentElement?.parentElement).toHaveTextContent(
      "12 个 skill",
    );
    expect(screen.getByTestId("face")).toBeInTheDocument();
  });

  it("rides a titleAction beside the name, outside the heading", () => {
    renderHead({ titleAction: <button type="button">打开仓库</button> });

    const title = screen.getByRole("heading", { name: "acme/tools" });
    const beside = screen.getByRole("button", { name: "打开仓库" });

    // The mark follows the name and leads the trailing action, and it stays
    // out of the `h1` so the heading keeps the entity's name as its whole
    // accessible name.
    expect(
      title.compareDocumentPosition(beside) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      beside.compareDocumentPosition(
        screen.getByRole("button", { name: "在 GitHub 打开" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps 返回 as the mark's name and its tip, not as a word on the row", async () => {
    const user = userEvent.setup();
    renderHead();

    // Nothing prints the word: this row's other half is a name the reader is
    // trying to read.
    expect(screen.queryByText("返回")).toBeNull();

    // It is not lost, though — it is where a mark with no room for it says it,
    // and the link still points at the list for the clicks the hook leaves be.
    const back = screen.getByRole("link", { name: "返回" });
    expect(back).toHaveAttribute("href", "/list");

    await user.hover(back);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("返回");
  });

  it("leaves the face and the action empty when a page has neither", () => {
    renderHead({ avatar: undefined, action: undefined });

    // The local pool's head: no owner to draw a face for, nothing to open — and
    // the row is the same shape with both slots empty.
    expect(
      screen.getByRole("heading", { name: "acme/tools" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("face")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
