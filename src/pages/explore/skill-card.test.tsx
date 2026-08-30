import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SkillCard } from "./skill-card";
import { installSkillFromSource } from "../../lib/local-skills";
import { renderWithRouter } from "../../test/test-utils";
import type { Skill } from "../../types/skill";

vi.mock("../../lib/local-skills", () => ({
  installSkillFromSource: vi.fn(),
}));

const skill: Skill = {
  name: "pdf",
  repo: "anthropics/skills",
  description: "Read and merge PDF documents.",
  stars: 169600,
};

describe("SkillCard", () => {
  it("renders name, repo, description and formatted stars", () => {
    renderWithRouter(<SkillCard skill={skill} />);

    expect(screen.getByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("anthropics/skills")).toBeInTheDocument();
    expect(
      screen.getByText("Read and merge PDF documents."),
    ).toBeInTheDocument();
    expect(screen.getByText("169.6K")).toBeInTheDocument();
  });

  it("renders with an empty description placeholder", () => {
    renderWithRouter(<SkillCard skill={{ ...skill, description: "" }} />);

    expect(screen.getByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("anthropics/skills")).toBeInTheDocument();
    expect(screen.getByText("169.6K")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "安装" })).toBeEnabled();
  });

  it("shows an install button initially", () => {
    renderWithRouter(<SkillCard skill={skill} />);
    const button = screen.getByRole("button", { name: "安装" });
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent("安装");
  });

  it("installs the skill and switches to a disabled 'installed' state", async () => {
    const user = userEvent.setup();
    vi.mocked(installSkillFromSource).mockResolvedValue(undefined);
    renderWithRouter(<SkillCard skill={skill} />);

    await user.click(screen.getByRole("button", { name: "安装" }));
    expect(installSkillFromSource).toHaveBeenCalledWith(skill.repo, skill.name);
    expect(
      await screen.findByRole("button", { name: "已安装" }),
    ).toBeDisabled();
  });

  it("returns to '重试' and surfaces the error when the install fails", async () => {
    const user = userEvent.setup();
    vi.mocked(installSkillFromSource).mockRejectedValue(
      new Error("clone failed: network unreachable"),
    );
    renderWithRouter(<SkillCard skill={skill} />);

    await user.click(screen.getByRole("button", { name: "安装" }));
    expect(await screen.findByRole("button", { name: "重试" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "clone failed: network unreachable",
    );
  });

  it("opens the detail sheet when the card is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithRouter(<SkillCard skill={skill} onSelect={onSelect} />);

    await user.click(screen.getByText("pdf"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("supports keyboard activation via Enter", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithRouter(<SkillCard skill={skill} onSelect={onSelect} />);

    screen.getByRole("button", { name: "查看 pdf 详情" }).focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("does not open the detail sheet when clicking install", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithRouter(<SkillCard skill={skill} onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: "安装" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("highlights the selected card", () => {
    renderWithRouter(<SkillCard skill={skill} selected onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "查看 pdf 详情" })).toHaveClass(
      "ring-primary",
    );
  });

  it("wraps matched name tokens in <mark> and keeps the name intact", () => {
    const { container } = renderWithRouter(
      <SkillCard
        skill={{ ...skill, name: "pdf-tools" }}
        matched={{ name: ["pdf"] }}
      />,
    );

    const mark = screen.getByText("pdf");
    expect(mark.tagName).toBe("MARK");
    // The name remains one logical string across the highlight segments.
    expect(container.querySelector("h3")).toHaveTextContent("pdf-tools");
  });

  it("highlights repo and description matches case-insensitively", () => {
    renderWithRouter(
      <SkillCard
        skill={skill}
        matched={{ repo: ["anthropics"], description: ["pdf"] }}
      />,
    );

    // The description token "PDF" matches the lowercased term "pdf"; the
    // original casing is preserved inside the mark.
    expect(screen.getByText("anthropics").tagName).toBe("MARK");
    expect(screen.getByText("PDF").tagName).toBe("MARK");
  });

  it("does not mark tokens that only partially match a term", () => {
    const { container } = renderWithRouter(
      <SkillCard skill={skill} matched={{ name: ["pd"] }} />,
    );

    // Matched terms are always whole indexed tokens; "pd" is not.
    expect(container.querySelector("mark")).toBeNull();
    expect(screen.getByText("pdf")).toBeInTheDocument();
  });

  it("renders without any <mark> when nothing matched", () => {
    const { container } = renderWithRouter(<SkillCard skill={skill} />);

    expect(container.querySelector("mark")).toBeNull();
  });
});
