import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SkillCard } from "./skill-card";
import type { Skill } from "../types/skill";

const skill: Skill = {
  name: "pdf",
  repo: "anthropics/skills",
  description: "Read and merge PDF documents.",
  stars: 169600,
};

describe("SkillCard", () => {
  it("renders name, repo, description and formatted stars", () => {
    render(<SkillCard skill={skill} />);

    expect(screen.getByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("anthropics/skills")).toBeInTheDocument();
    expect(
      screen.getByText("Read and merge PDF documents."),
    ).toBeInTheDocument();
    expect(screen.getByText("169.6K")).toBeInTheDocument();
  });

  it("renders with an empty description placeholder", () => {
    render(<SkillCard skill={{ ...skill, description: "" }} />);

    expect(screen.getByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("anthropics/skills")).toBeInTheDocument();
    expect(screen.getByText("169.6K")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "安装" })).toBeEnabled();
  });

  it("shows an install button initially", () => {
    render(<SkillCard skill={skill} />);
    const button = screen.getByRole("button", { name: "安装" });
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent("安装");
  });

  it("switches to a disabled 'installed' state after clicking install", async () => {
    const user = userEvent.setup();
    render(<SkillCard skill={skill} />);

    const button = screen.getByRole("button", { name: "安装" });
    await user.click(button);

    const installed = screen.getByRole("button", { name: "已安装" });
    expect(installed).toBeDisabled();
    expect(installed).toHaveTextContent("已安装");
  });

  it("opens the detail sheet when the card is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<SkillCard skill={skill} onSelect={onSelect} />);

    await user.click(screen.getByText("pdf"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("supports keyboard activation via Enter", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<SkillCard skill={skill} onSelect={onSelect} />);

    screen.getByRole("button", { name: "查看 pdf 详情" }).focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("does not open the detail sheet when clicking install", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<SkillCard skill={skill} onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: "安装" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("highlights the selected card", () => {
    render(<SkillCard skill={skill} selected onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "查看 pdf 详情" })).toHaveClass(
      "ring-primary",
    );
  });
});
