import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { ListCorpus } from "./list-corpus";
import { renderWithRouter } from "../test/test-utils";

/** The readout, addressed by what it states rather than by its markup. */
function corpus(): HTMLElement {
  const element = screen.getByText(/个 skill/);
  return element.closest("p") as HTMLElement;
}

describe("ListCorpus", () => {
  it("states both figures, each in its own unit, whichever shape the list is in", () => {
    // The two figures are one corpus, not two answers to the same question: the
    // row's own `全部` count already states one of them in the unit on screen, so
    // a readout that followed the shape would be the same number twice over. This
    // one always says both, and so never changes when the shape does.
    renderWithRouter(<ListCorpus skills={8013} repos={1240} />);

    // The gap around the separator is the row's (a flex gap), so the text is the
    // two phrases and the dot between them.
    expect(corpus()).toHaveTextContent(/8K 个 skill\s*·\s*1\.2K 个仓库/);
  });

  it("words the repository figure as a source on the installed list", () => {
    // A machine holding one skill out of a repository holds no repository, so
    // the store's own wording would be a claim about the registry rather than
    // about this machine.
    renderWithRouter(<ListCorpus skills={37} repos={6} variant="installed" />);

    expect(corpus()).toHaveTextContent(/37 个 skill\s*·\s*6 个来源仓库/);
  });

  it("keeps the exact figures reachable under the compacted ones", () => {
    // A corpus figure climbs while a download streams, so the printed pair is
    // compacted; the title is where the uncompacted numbers stay reachable, the
    // way a card's stars keep theirs.
    renderWithRouter(<ListCorpus skills={8013} repos={1240} />);

    expect(corpus()).toHaveAttribute("title", "8013 · 1240");
  });

  it("is a readout, not a live region and not a control", () => {
    renderWithRouter(<ListCorpus skills={8013} repos={1240} />);

    // Nothing here narrows, orders or switches, and a corpus figure that climbs
    // every few hundred milliseconds must not narrate the download to a screen
    // reader — the climbing registry count is progress, not an answer.
    expect(corpus()).not.toHaveAttribute("aria-live");
    expect(corpus().querySelector("button")).toBeNull();
    expect(corpus()).not.toHaveAttribute("aria-label");
  });
});