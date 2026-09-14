import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { SkillCard } from "./skill-card";
import { renderWithRouter } from "../test/test-utils";
import type { SkillView } from "../lib/skill-view";

vi.mock("../lib/open-external", () => ({ openExternal: vi.fn() }));

const sourced: SkillView = {
  name: "pdf",
  repo: "anthropics/skills",
  description: "Read and merge PDF documents.",
  stars: 169600,
  downloads: 2991984,
};

const local: SkillView = {
  ...sourced,
  repo: "",
  stars: 0,
  downloads: 0,
  storeBacked: false,
};

describe("SkillCard", () => {
  it("names the source under the title on a sourced skill", () => {
    const { container } = renderWithRouter(<SkillCard skill={sourced} />);

    // The source line is the card's second row, and it carries both the chip
    // and the repo it stands for — the header is never a name-only row.
    const line = container.querySelector('[data-slot="card-description"]');
    expect(line).not.toBeNull();
    expect(line).toHaveTextContent("anthropics/skills");
    expect(
      screen.getByRole("button", { name: "仓库 anthropics/skills" }),
    ).toBeInTheDocument();
  });

  it("labels an unsourced skill instead of naming a repo", () => {
    renderWithRouter(<SkillCard skill={local} />);

    expect(screen.getByText("本地安装")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^仓库 / }),
    ).not.toBeInTheDocument();
  });

  it("closes the footer rather than leaving an empty rail", () => {
    // A skill the registry cannot back has no classification and no figure:
    // rendering the rail anyway would leave a hairline over nothing.
    const { container } = renderWithRouter(<SkillCard skill={local} />);

    expect(container.querySelector('[data-slot="card-footer"]')).toBeNull();
  });

  it("keeps the figure alone on the rail when there is no classification", () => {
    const { container } = renderWithRouter(<SkillCard skill={sourced} />);

    const footer = container.querySelector('[data-slot="card-footer"]');
    expect(footer).not.toBeNull();
    expect(footer).toHaveTextContent("712.4K");
    expect(screen.queryByText("开发编程")).not.toBeInTheDocument();
  });

  it("puts the classification and the figure on the same rail", () => {
    const { container } = renderWithRouter(
      <SkillCard
        skill={{ ...sourced, profile: { domain: "办公效率" } }}
      />,
    );

    const footer = container.querySelector('[data-slot="card-footer"]');
    expect(footer).toHaveTextContent("办公效率");
    expect(footer).toHaveTextContent("712.4K");
  });

  it("falls back to a placeholder for a missing description", () => {
    renderWithRouter(<SkillCard skill={{ ...sourced, description: "" }} />);

    expect(screen.getByText("暂无描述")).toBeInTheDocument();
  });

  it("dims a muted card and rings the selected one", () => {
    const { container, rerender } = renderWithRouter(
      <SkillCard skill={sourced} muted onSelect={() => {}} />,
    );

    const card = () => container.querySelector('[data-slot="card"]')!;
    expect(card()).toHaveClass("opacity-60");
    expect(card()).not.toHaveClass("ring-primary");

    rerender(<SkillCard skill={sourced} selected onSelect={() => {}} />);
    expect(card()).toHaveClass("ring-primary");
    expect(card()).not.toHaveClass("opacity-60");
  });
});
