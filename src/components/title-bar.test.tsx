import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { TitleBar } from "./title-bar";

describe("TitleBar", () => {
  afterEach(() => {
    // @ts-expect-error test-only cleanup
    delete window.__TAURI_INTERNALS__;
  });

  it("renders the title and version", () => {
    render(
      <MemoryRouter>
        <TitleBar />
      </MemoryRouter>,
    );
    expect(screen.getByText("Skillone")).toBeInTheDocument();
    expect(screen.getByText("v0.0.0")).toBeInTheDocument();
  });

  it("renders the active route title inside the router", () => {
    render(
      <MemoryRouter initialEntries={["/explore"]}>
        <TitleBar />
      </MemoryRouter>,
    );
    expect(screen.getByText("添加 Skills")).toBeInTheDocument();
    expect(screen.queryByText("Skillone")).not.toBeInTheDocument();
  });

  it("renders faux traffic lights outside Tauri", () => {
    render(
      <MemoryRouter>
        <TitleBar />
      </MemoryRouter>,
    );

    // The three faux lights use the macOS colors (#FF5F57 etc.).
    expect(document.querySelector('header [class*="FF5F57"]')).toBeTruthy();
    expect(document.querySelector('header [class*="FEBC2E"]')).toBeTruthy();
    expect(document.querySelector('header [class*="28C840"]')).toBeTruthy();
  });

  it("hides faux traffic lights under Tauri", () => {
    // @ts-expect-error test-only global injection
    window.__TAURI_INTERNALS__ = {};
    render(
      <MemoryRouter>
        <TitleBar />
      </MemoryRouter>,
    );

    expect(document.querySelector('header [class*="FF5F57"]')).toBeNull();
    expect(document.querySelector('header [class*="FEBC2E"]')).toBeNull();
    expect(document.querySelector('header [class*="28C840"]')).toBeNull();
  });
});
