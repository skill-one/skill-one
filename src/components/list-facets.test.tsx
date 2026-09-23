import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ListFacets } from "./list-facets";
import { renderWithRouter } from "../test/test-utils";

const FACETS = [
  { key: "development", count: 12 },
  { key: "design", count: 7 },
];

function renderFacets(
  overrides: Partial<Parameters<typeof ListFacets>[0]> = {},
) {
  const onSelect = vi.fn();
  renderWithRouter(
    <ListFacets
      facets={FACETS}
      total={42}
      countLabel="个仓库"
      selected={null}
      onSelect={onSelect}
      {...overrides}
    />,
  );
  return { onSelect };
}

describe("ListFacets", () => {
  it("leads with 全部, counting the whole list", () => {
    renderFacets();

    expect(screen.getByRole("button", { name: /全部/ })).toHaveTextContent(
      "42",
    );
  });

  it("shows every scope when the line cannot be measured", () => {
    renderFacets();

    // jsdom lays nothing out, so the row reports no width. Every chip is shown
    // then: a filter hidden behind a control nobody can see is worse than a row
    // that overflows.
    expect(screen.getAllByRole("button")).toHaveLength(1 + FACETS.length);
    expect(screen.queryByRole("button", { name: /更多/ })).toBeNull();
  });

  it("scopes the list from a chip, and clears it from 全部", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderFacets();

    await user.click(screen.getAllByRole("button")[1]);
    expect(onSelect).toHaveBeenCalledWith("development");

    await user.click(screen.getByRole("button", { name: /全部/ }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("keeps a second, hidden copy of the row for measuring", () => {
    renderFacets();

    // The measurement is taken from chips that are laid out but never seen, so
    // computing the fit cannot depend on a row that has already hidden some.
    expect(
      document.querySelectorAll('[aria-hidden="true"] button'),
    ).toHaveLength(FACETS.length);
  });
});
