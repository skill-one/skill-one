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
});
