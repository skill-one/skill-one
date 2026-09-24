import { Code } from "lucide-react";
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
      // A renderable lucide icon component (a forwardRef object in React 19),
      // not a colourful emoji string.
      expect(domain.icon).toEqual(expect.any(Object));
      expect(domain.icon.displayName).toEqual(expect.any(String));
      expect(domain.description.zh.length).toBeGreaterThan(4);
    }
  });

  it("resolves a key or a label, and returns undefined for an unknown one", () => {
    expect(domainMeta("development")?.icon).toBe(Code);
    expect(domainMeta("开发编程")?.key).toBe("development");
    expect(domainMeta("不存在的分类")).toBeUndefined();
  });
});

describe("DomainBadge", () => {
  it("renders the canonical monochrome icon next to the domain label", () => {
    renderWithRouter(<DomainBadge domain={["design-media"]} />);
    expect(screen.getByText("设计多媒体")).toBeInTheDocument();
    expect(document.querySelector("svg.lucide-palette")).toBeInTheDocument();
  });

  it("renders the raw key and no icon for a domain outside the taxonomy", () => {
    renderWithRouter(<DomainBadge domain={["future-domain"]} />);
    expect(screen.getByText("future-domain")).toBeInTheDocument();
    expect(document.querySelector("svg.lucide-circle-help")).toBeNull();
  });
});
