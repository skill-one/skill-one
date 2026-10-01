import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DeveloperDialog } from "./developer-dialog";
import { I18nProvider } from "../i18n/language-provider";
import {
  resetMockProvenance,
  seedMockLedgerRaw,
} from "../lib/provenance";

/**
 * The viewer reads the ledger through TanStack Query and renders it in the
 * app's default (Chinese) locale, so every assertion here is a rendered
 * sentence. The seed is raw JSONL — the viewer's contract is fidelity to the
 * file, including broken lines a structured seed could not express.
 */

const RAW = [
  JSON.stringify({
    name: "pdf",
    repo: "anthropics/skills",
    installedAt: "2026-09-13T00:00:00.000Z",
    hash: "sha256:abc",
  }),
  "{broken",
  JSON.stringify({
    name: "my-tool",
    epoch: 7,
    fingerprint: { mtimeMs: 1738022400000, size: 48213 },
    candidates: [
      {
        repo: "a/skills",
        similarity: 0.93,
        stars: 12,
        downloads: 340,
        description: "Read PDF files.",
      },
    ],
  }),
].join("\n");

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <DeveloperDialog open onOpenChange={() => {}} />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe("DeveloperDialog", () => {
  beforeEach(() => resetMockProvenance());
  afterEach(() => resetMockProvenance());

  it("renders every ledger line as a card with its kind and fields", async () => {
    seedMockLedgerRaw(RAW);
    renderDialog();

    // One card per line, named by skill, counted in the toolbar.
    expect(
      await screen.findByRole("heading", { name: "pdf" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "my-tool" }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 条记录")).toBeInTheDocument();
    // The source record's fields, verbatim.
    expect(screen.getByText("anthropics/skills")).toBeInTheDocument();
    expect(screen.getByText("2026-09-13T00:00:00.000Z")).toBeInTheDocument();
    expect(screen.getByText("sha256:abc")).toBeInTheDocument();
    // The resolution record renders fully, nested objects included.
    expect(screen.getByText("1738022400000")).toBeInTheDocument();
    expect(screen.getByText("48213")).toBeInTheDocument();
    expect(screen.getByText("0.93")).toBeInTheDocument();
    expect(screen.getByText("Read PDF files.")).toBeInTheDocument();
    // Kind badges distinguish the two record kinds.
    expect(screen.getByText("来源")).toBeInTheDocument();
    expect(screen.getByText("解析缓存")).toBeInTheDocument();
  });

  it("flags a broken line with its verbatim text instead of hiding it", async () => {
    seedMockLedgerRaw(RAW);
    renderDialog();

    expect(await screen.findByText("无法解析的行")).toBeInTheDocument();
    expect(screen.getByText("{broken")).toBeInTheDocument();
  });

  it("renders an unrecognized record anyway, flagged", async () => {
    seedMockLedgerRaw(JSON.stringify({ name: "weird", size: 3 }));
    renderDialog();

    expect(
      await screen.findByRole("heading", { name: "weird" }),
    ).toBeInTheDocument();
    expect(screen.getByText("未识别")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("switches to the raw view showing the verbatim JSONL", async () => {
    const user = userEvent.setup();
    seedMockLedgerRaw(RAW);
    renderDialog();
    await screen.findByRole("heading", { name: "pdf" });

    await user.click(screen.getByRole("button", { name: "原始 JSONL" }));

    // The <pre> holds exactly the stored bytes.
    const pre = screen.getByText((_, element) => element?.tagName === "PRE");
    expect(pre).toHaveTextContent(/broken/);
    expect(pre.textContent).toBe(RAW);
    expect(screen.getByRole("button", { name: "复制" })).toBeInTheDocument();
  });

  it("shows an empty state when nothing is recorded", async () => {
    renderDialog();

    expect(
      await screen.findByText("账本为空——安装技能后，其来源将记录在这里"),
    ).toBeInTheDocument();
  });
});
