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

const RAW = [
  JSON.stringify({ kind: "meta", v: 3, index: '"e1"' }),
  JSON.stringify({ kind: "source", name: "pdf", repo: "anthropics/skills", via: "install" }),
  "{broken",
  JSON.stringify({
    kind: "pending",
    name: "my-tool",
    key: "1a2b3c4d5e6f7081",
    fingerprint: { mtimeMs: 1738022400000, size: 48213 },
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

  it("renders verbatim raw ledger content directly", async () => {
    seedMockLedgerRaw(RAW);
    renderDialog();

    const pre = await screen.findByText((_, element) => element?.tagName === "PRE");
    expect(pre).toHaveTextContent(/broken/);
    expect(pre.textContent).toBe(RAW);
    expect(screen.getByRole("button", { name: "复制" })).toBeInTheDocument();
  });

  it("copies raw content to clipboard when copy button is clicked", async () => {
    const user = userEvent.setup();
    seedMockLedgerRaw(RAW);
    renderDialog();

    const copyBtn = await screen.findByRole("button", { name: "复制" });
    await user.click(copyBtn);
    expect(await screen.findByRole("button", { name: "已复制" })).toBeInTheDocument();
  });

  it("shows an empty state when nothing is recorded", async () => {
    renderDialog();

    expect(
      await screen.findByText("账本为空——安装技能后，其来源将记录在这里"),
    ).toBeInTheDocument();
  });
});
