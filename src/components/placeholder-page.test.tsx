import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sparkles } from "lucide-react";

import { PlaceholderPage } from "./placeholder-page";

describe("PlaceholderPage", () => {
  it("renders the icon, title and coming-soon message", () => {
    render(<PlaceholderPage icon={Sparkles} title="精选" />);

    expect(screen.getByText("精选")).toBeInTheDocument();
    expect(screen.getByText("即将上线，敬请期待")).toBeInTheDocument();
  });

  it("lets callers override the coming-soon message", () => {
    render(<PlaceholderPage icon={Sparkles} title="仓库" description="按仓库浏览" />);

    expect(screen.getByText("仓库")).toBeInTheDocument();
    expect(screen.getByText("按仓库浏览")).toBeInTheDocument();
    expect(screen.queryByText("即将上线，敬请期待")).not.toBeInTheDocument();
  });
});
