import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { DOMAINS, domainMeta } from "../data/domains";
import { DomainBadge } from "./domain-badge";
import { renderWithRouter } from "../test/test-utils";

describe("domainMeta", () => {
  it("covers the dataset's fixed 13-domain taxonomy", () => {
    expect(DOMAINS).toHaveLength(13);
    for (const domain of DOMAINS) {
      expect(domain.emoji).toMatch(/\p{Extended_Pictographic}/u);
      expect(domain.description.length).toBeGreaterThan(4);
    }
  });

  it("resolves a known name and returns undefined for an unknown one", () => {
    expect(domainMeta("开发编程")?.emoji).toBe("💻");
    expect(domainMeta("不存在的分类")).toBeUndefined();
  });
});

describe("DomainBadge", () => {
  it("renders the canonical emoji next to the domain name", () => {
    renderWithRouter(<DomainBadge domain="设计多媒体" />);
    expect(screen.getByText("设计多媒体")).toBeInTheDocument();
    expect(screen.getByText("🎨")).toBeInTheDocument();
  });

  it("renders no emoji for a domain outside the taxonomy", () => {
    renderWithRouter(<DomainBadge domain="未来新分类" />);
    expect(screen.getByText("未来新分类")).toBeInTheDocument();
    expect(screen.queryByText("❓")).not.toBeInTheDocument();
  });
});
