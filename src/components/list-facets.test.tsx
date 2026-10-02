import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ListFacets } from "./list-facets";
import { renderWithRouter } from "../test/test-utils";

const FACETS = [
  { key: "development", count: 12 },
  { key: "testing", count: 7 },
];

function renderFacets(
  overrides: Partial<Parameters<typeof ListFacets>[0]> = {},
) {
  const onSelect = vi.fn();
  renderWithRouter(
    <ListFacets
      facets={FACETS}
      total={42}
      selected={null}
      onSelect={onSelect}
      {...overrides}
    />,
  );
  return { onSelect };
}

const trigger = () => screen.getByRole("button", { name: "分类" });

describe("ListFacets", () => {
  it("states the current scope on the trigger", () => {
    renderFacets();

    // With nothing picked the trigger reads 全部 and counts the whole list;
    // it is the one thing the reader must always be able to see.
    expect(trigger()).toHaveTextContent("全部");
    expect(trigger()).toHaveTextContent("42");
  });

  it("states a picked scope on the trigger, count included", () => {
    renderFacets({ selected: "development" });

    expect(trigger()).toHaveTextContent("开发编程");
    expect(trigger()).toHaveTextContent("12");
  });

  it("opens a menu of scopes, 全部 first, each with its count", async () => {
    const user = userEvent.setup();
    renderFacets();
    await user.click(trigger());

    // The menu mounts asynchronously, so the queries wait for it.
    const items = await screen.findAllByRole("menuitemradio");
    expect(items[0]).toHaveTextContent("全部");
    expect(items[0]).toHaveTextContent("42");
    expect(
      screen.getByRole("menuitemradio", { name: /开发编程/ }),
    ).toHaveTextContent("12");
    expect(
      screen.getByRole("menuitemradio", { name: /测试与质量/ }),
    ).toHaveTextContent("7");
  });

  it("marks the scope on screen in the menu", async () => {
    const user = userEvent.setup();
    renderFacets();
    await user.click(trigger());

    expect(await screen.findByRole("menuitemradio", { name: /全部/ }))
      .toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("menuitemradio", { name: /开发编程/ }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("scopes the list from the menu", async () => {
    const { onSelect } = renderFacets();
    const user = userEvent.setup();
    await user.click(trigger());

    await user.click(
      await screen.findByRole("menuitemradio", { name: /开发编程/ }),
    );
    expect(onSelect).toHaveBeenCalledWith("development");
  });

  it("clears the scope from 全部", async () => {
    const { onSelect } = renderFacets({ selected: "development" });
    const user = userEvent.setup();
    await user.click(trigger());

    await user.click(await screen.findByRole("menuitemradio", { name: /全部/ }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});
