import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { DOMAINS, domainMeta } from "../data/domains";
import { DomainBadge } from "./domain-badge";
import { renderWithRouter } from "../test/test-utils";

describe("domainMeta", () => {
  it("covers the dataset's fixed 13-domain taxonomy", () => {
    expect(DOMAINS).toHaveLength(13);
    for (const domain of DOMAINS) {
      expect(domain.key).toMatch(/^[a-z][a-z-]*$/);
      // A colored emoji, present on every domain.
      expect(domain.emoji.trim().length).toBeGreaterThan(0);
      expect(domain.description.zh.length).toBeGreaterThan(4);
    }
  });

  it("resolves a key or a label, and returns undefined for an unknown one", () => {
    expect(domainMeta("development")?.emoji).toBe("💻");
    expect(domainMeta("开发编程")?.key).toBe("development");
    expect(domainMeta("不存在的分类")).toBeUndefined();
  });
});

describe("DomainBadge", () => {
  it("renders the canonical emoji next to the domain label", () => {
    renderWithRouter(<DomainBadge domain={["design-media"]} />);
    expect(screen.getByText("设计多媒体")).toBeInTheDocument();
    expect(screen.getByText("🎨")).toBeInTheDocument();
  });

  it("renders the raw key and no emoji for a domain outside the taxonomy", () => {
    renderWithRouter(<DomainBadge domain={["future-domain"]} />);
    expect(screen.getByText("future-domain")).toBeInTheDocument();
    expect(screen.queryByText("❓")).toBeNull();
  });

  it("omits the emoji when it is just the initial character of the label", () => {
    // Custom tag without explicit emoji gets its first character as emoji (e.g. "开" for "开发辅助")
    renderWithRouter(<DomainBadge domain={["开发辅助"]} />);
    expect(screen.getByText("开发辅助")).toBeInTheDocument();
    expect(screen.queryByText("开")).toBeNull();
  });

  it("renders unclassified label and no question mark emoji", () => {
    renderWithRouter(<DomainBadge domain={["unclassified"]} />);
    expect(screen.getByText("未分类")).toBeInTheDocument();
    expect(screen.queryByText("❓")).toBeNull();
  });
});
