import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

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
  // The installed adapter always sets `installedAt` — null included (see
  // `installedSkillView`) — which is what keeps an installed record from
  // reading as a live hit.
  installedAt: null,
  storeBacked: false,
};

/**
 * A live skills.sh hit: a well-known source is a bare host, not `owner/repo`,
 * and the row carries no index entry to take figures from.
 */
const wellKnown: SkillView = {
  ...sourced,
  repo: "smithery.ai",
  stars: 0,
  downloads: 199323,
  storeBacked: false,
};

describe("SkillCard", () => {
  it("names the source on the rail, with the owner's chip beside it", () => {
    const { container } = renderWithRouter(<SkillCard skill={sourced} />);

    // The rail is the card's one metadata line, and it carries both the chip
    // and the repo it stands for.
    const rail = container.querySelector('[data-slot="card-footer"]');
    expect(rail).not.toBeNull();
    expect(rail).toHaveTextContent("anthropics/skills");
    expect(
      screen.getByRole("button", { name: "仓库 anthropics/skills" }),
    ).toBeInTheDocument();
  });

  it("opens with the name rather than a placeholder cover", () => {
    // The dataset publishes no per-skill illustration, so the card used to
    // open with a letter square that stood for a picture nobody had. The name
    // leads the card instead.
    const { container } = renderWithRouter(<SkillCard skill={sourced} />);

    expect(container.querySelector('[data-slot="skill-cover"]')).toBeNull();
    expect(
      container.querySelector('[data-slot="card-header"] h3'),
    ).toHaveTextContent("pdf");
  });

  it("labels an unsourced skill instead of naming a repo", () => {
    renderWithRouter(<SkillCard skill={local} />);

    expect(screen.getByText("本地安装")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^仓库 / }),
    ).not.toBeInTheDocument();
  });

  it("opens a bare-host source at its own address", () => {
    renderWithRouter(<SkillCard skill={wellKnown} />);

    // The chip calls a host a source, not a repository — there is no GitHub
    // repository name to prefix, so the host is the address.
    fireEvent.click(screen.getByRole("button", { name: "来源 smithery.ai" }));

    expect(screen.getByRole("link", { name: "打开 smithery.ai" })).toHaveAttribute(
      "href",
      "https://smithery.ai",
    );
  });

  it("keeps the rail, naming the local install in place of a source", () => {
    // A skill the registry cannot back has no classification and no figure,
    // but it is never blank: the rail states 本地安装 where it would otherwise
    // name a repository, so it is not a hairline over nothing.
    const { container } = renderWithRouter(<SkillCard skill={local} />);

    const rail = container.querySelector('[data-slot="card-footer"]');
    expect(rail).not.toBeNull();
    expect(rail).toHaveTextContent("本地安装");
  });

  it("keeps the figure alone on the rail when there is no classification", () => {
    const { container } = renderWithRouter(<SkillCard skill={sourced} />);

    const footer = container.querySelector('[data-slot="card-footer"]');
    expect(footer).not.toBeNull();
    expect(footer).toHaveTextContent("3M");
    expect(screen.queryByText("开发编程")).not.toBeInTheDocument();
  });

  it("puts the classification and the figure on the same rail", () => {
    const { container } = renderWithRouter(
      <SkillCard
        skill={{ ...sourced, profile: { domain: ["office-productivity"] } }}
      />,
    );

    const footer = container.querySelector('[data-slot="card-footer"]');
    expect(footer).toHaveTextContent("办公效率");
    expect(footer).toHaveTextContent("3M");
  });

  it("falls back to a placeholder for a missing description", () => {
    renderWithRouter(<SkillCard skill={{ ...sourced, description: "" }} />);

    expect(screen.getByText("暂无描述")).toBeInTheDocument();
  });

  it("claims no description on a live hit, whose source carries none", () => {
    // A live row's source publishes no description field at all, so the card
    // claims nothing rather than stating 暂无描述 — a fact nobody
    // established. An installed record without one is a local fact, and
    // keeps the placeholder.
    const { container: liveContainer } = renderWithRouter(
      <SkillCard skill={{ ...wellKnown, description: "" }} />,
    );
    expect(liveContainer.querySelector('[data-slot="card-content"]')).toHaveTextContent(
      "",
    );

    const { container: localContainer } = renderWithRouter(
      <SkillCard skill={{ ...local, description: "" }} />,
    );
    expect(localContainer.querySelector('[data-slot="card-content"]')).toHaveTextContent(
      "暂无描述",
    );
  });

  it("keeps the corner action's click off the card body", () => {
    // The card body opens the detail panel; the action beside the name
    // installs. Pressing one must never count as pressing the other.
    const onSelect = vi.fn();
    renderWithRouter(
      <SkillCard
        skill={sourced}
        onSelect={onSelect}
        action={<button type="button">安装</button>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "安装" }));

    expect(onSelect).not.toHaveBeenCalled();
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
