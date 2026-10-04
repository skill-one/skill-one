import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ListToolbar } from "./list-toolbar";
import { useListQuery } from "../hooks/use-list-view";
import { resetListView } from "../lib/list-view";
import { renderWithRouter } from "../test/test-utils";

/**
 * What a search field costs the list under it.
 *
 * This file exists because the answer is a performance claim, and a performance
 * claim that only lives in a comment stops being true the moment the next person
 * "simplifies" a signature. The two things asserted here are what a reader
 * actually feels: the word under their cursor never lags their fingers, and the
 * list below the field never stirs for a keystroke it was not asked about.
 */
const { registrySnapshot } = vi.hoisted(() => ({
  registrySnapshot: { ready: true } as { ready: boolean },
}));

vi.mock("../lib/registry/client", () => ({
  getRegistrySnapshot: () => registrySnapshot,
  subscribeRegistry: () => () => {},
}));

/**
 * A stand-in for the list a search re-answers, reading the same shared view a
 * real page reads (`useListQuery`). A real list is hundreds of memoized rows,
 * which is exactly what makes "how many times did the list re-render" awkward to
 * assert; the page's own render count is both simpler and the thing that
 * decides the rest.
 */
function Answer({ onRender }: { onRender: () => void }) {
  onRender();
  return <p data-testid="answer">{useListQuery("store")}</p>;
}

function renderSearchOver(onRender: () => void) {
  return renderWithRouter(
    <>
      <ListToolbar
        destination="store"
        facets={[]}
        total={0}
        sorts={["popularity"]}
      />
      <Answer onRender={onRender} />
    </>,
  );
}

beforeEach(() => {
  registrySnapshot.ready = true;
  resetListView();
});

describe("typing into a list's own field", () => {
  it("does not re-render the answer for a single keystroke", async () => {
    const user = userEvent.setup();
    let renders = 0;
    renderSearchOver(() => renders++);
    const before = renders;

    await user.type(screen.getByLabelText("搜索 Skill"), "pdf");

    // Three keystrokes, and not one re-render of the list. A shared view written
    // per character makes "re-render the list" mean "re-render the list, and
    // every row in it, and every install button in every row" — paid on every
    // letter, and read by the reader as their own field lagging their fingers.
    expect(renders).toBe(before);
    // The word itself never lagged: it is on screen keystroke by keystroke.
    expect(screen.getByLabelText("搜索 Skill")).toHaveValue("pdf");

    // And the list is woken by the question, exactly once, when the word has
    // settled — not three times for three half-words.
    await waitFor(() =>
      expect(screen.getByTestId("answer")).toHaveTextContent("pdf"),
    );
    expect(renders).toBe(before + 1);
  });

  it("asks the list again for each word the reader settles on", async () => {
    const user = userEvent.setup();
    let renders = 0;
    renderSearchOver(() => renders++);

    await user.type(screen.getByLabelText("搜索 Skill"), "pd");
    await waitFor(() =>
      expect(screen.getByTestId("answer")).toHaveTextContent("pd"),
    );
    const afterFirst = renders;

    await user.type(screen.getByLabelText("搜索 Skill"), "f");
    await waitFor(() =>
      expect(screen.getByTestId("answer")).toHaveTextContent("pdf"),
    );

    // Refining a question is a new question, and it is answered as one: the
    // settle is a pause in typing, not a filter that only ever lets the first
    // word through.
    expect(renders).toBe(afterFirst + 1);
  });
});
