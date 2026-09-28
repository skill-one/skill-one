import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ActivityDialog } from "./activity-dialog";
import { I18nProvider } from "../i18n/language-provider";
import { resetMockActivity, seedMockActivity } from "../lib/activity";
import type { ActivityRecord } from "../lib/activity";

/**
 * The viewer reads the log through TanStack Query and renders it in the app's
 * default (Chinese) locale, so every assertion here is a rendered sentence.
 */

const now = Date.now();

const RECORDS: ActivityRecord[] = [
  {
    ts: new Date(now).toISOString(),
    event: "skill.install",
    actor: "user",
    target: { kind: "skill", names: ["pdf"] },
    detail: { repo: "anthropics/skills", skipped: false },
    result: "ok",
  },
  {
    ts: new Date(now - 1_000).toISOString(),
    event: "agent.link",
    actor: "auto",
    target: { kind: "agent", names: ["cursor"] },
    detail: { status: "linked", adopted: 2, quarantined: 1, conflicts: 0 },
    result: "ok",
  },
];

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <ActivityDialog open onOpenChange={() => {}} />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe("ActivityDialog", () => {
  beforeEach(() => resetMockActivity());
  afterEach(() => resetMockActivity());

  it("lists the recorded actions, newest first, under a day header", async () => {
    seedMockActivity(RECORDS);
    renderDialog();

    expect(screen.getByText("活动日志")).toBeInTheDocument();
    expect(
      await screen.findByText("从 anthropics/skills 安装了 pdf"),
    ).toBeInTheDocument();
    expect(screen.getByText("今天")).toBeInTheDocument();
    expect(screen.getByText("已关联 cursor")).toBeInTheDocument();
    // An action the user did not take carries its reason as a label.
    expect(screen.getByText("自动")).toBeInTheDocument();
  });

  it("shows an empty state when nothing is recorded", async () => {
    renderDialog();

    expect(await screen.findByText("暂无活动记录")).toBeInTheDocument();
  });

  it("filters to one category", async () => {
    const user = userEvent.setup();
    seedMockActivity(RECORDS);
    renderDialog();
    await screen.findByText("从 anthropics/skills 安装了 pdf");

    await user.click(screen.getByRole("button", { name: "Agent" }));

    expect(screen.getByText("已关联 cursor")).toBeInTheDocument();
    expect(
      screen.queryByText("从 anthropics/skills 安装了 pdf"),
    ).not.toBeInTheDocument();
  });

  it("mutes automatic actions when the toggle is off", async () => {
    const user = userEvent.setup();
    seedMockActivity(RECORDS);
    renderDialog();
    await screen.findByText("已关联 cursor");

    await user.click(
      screen.getByRole("switch", { name: "包含自动操作" }),
    );

    expect(
      screen.getByText("从 anthropics/skills 安装了 pdf"),
    ).toBeInTheDocument();
    expect(screen.queryByText("已关联 cursor")).not.toBeInTheDocument();
  });
});
