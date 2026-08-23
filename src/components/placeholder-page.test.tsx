import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { PlaceholderPage } from "./placeholder-page";

describe("PlaceholderPage", () => {
  it("renders the title and under-construction message", () => {
    render(<PlaceholderPage title="设置" />);

    expect(screen.getByText("设置")).toBeInTheDocument();
    expect(screen.getByText("该模块正在建设中，敬请期待")).toBeInTheDocument();
  });
});
