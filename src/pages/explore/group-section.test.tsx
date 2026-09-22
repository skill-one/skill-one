import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "../../test/test-utils";
import userEvent from "@testing-library/user-event";

import { GroupSection, type GroupMeta } from "./group-section";
import { formatCount } from "../../lib/utils";

/**
 * The section shell's own subject: the header's identity and its fold, the
 * preview's row measurement and its expander, and the scroll compensation that
 * keeps a pinned header under the pointer across a toggle that removes cards.
 *
 * Rendered directly rather than through a page. The shell is shared by the
 * store's category modes, the live section and the installed list, and its
 * mechanics are identical in all of them, so they belong to the shell. Which
 * mode builds which groups — and what a group's rows look like — is the page's
 * own subject, tested there.
 */

type Item = { id: string };

/** `count` rows, named after their index so a test can say which one is shown. */
const items = (count: number): Item[] =>
  Array.from({ length: count }, (_, i) => ({ id: `skill-${i}` }));

const META: GroupMeta = {
  key: "repo-acme/batch",
  title: "acme/batch",
  avatarOwner: "acme",
  stars: 12_300,
};

/** The shell over `count` items, inside the scrolling column a page gives it. */
function renderSection(count: number, meta: GroupMeta = META) {
  return render(
    <div className="overflow-y-auto">
      <GroupSection
        group={meta}
        index={0}
        items={items(count)}
        selected={null}
        rowKey={(item) => item.id}
        renderItem={(item) => <li>{item.id}</li>}
      />
    </div>,
  );
}

/** The group's header trigger, addressed by the label it always carries. */
function header(title: string, count: number) {
  return screen.getByRole("button", {
    name: `分组 ${title}，${count} 个 skill`,
  });
}

describe("GroupSection", () => {
  it("names the group with its ordinal, title and figures", () => {
    renderSection(3);

    const head = header("acme/batch", 3);
    expect(within(head).getByText("acme/batch")).toBeInTheDocument();
    // The leading group carries its ordinal as a medal-colored number, and the
    // figures the ordering used sit at the row's far edge — the stars compactly,
    // exactly as a card's rail prints them, then the item count.
    expect(within(head).getByText("1")).toBeInTheDocument();
    expect(
      within(head).getByText(new RegExp(formatCount(12_300))),
    ).toBeInTheDocument();
    expect(within(head).getByText("3 个")).toBeInTheDocument();
  });

  it("leads with a glyph and a note when the group has no owner", () => {
    // The live section's shape: a category glyph instead of an avatar, a note
    // that nothing else on the row carries, and an ordinal that is merely a
    // sequence (`plain`) rather than a rank.
    renderSection(2, {
      key: "skills-sh",
      title: "skills.sh 官方搜索",
      note: "实时结果，本地索引未收录",
      emoji: "🔎",
      ordinal: "plain",
    });

    const head = header("skills.sh 官方搜索", 2);
    expect(within(head).getByText("🔎")).toBeInTheDocument();
    expect(within(head).getByText("实时结果，本地索引未收录")).toBeInTheDocument();
    expect(within(head).getByText("1")).toBeInTheDocument();
  });

  it("folds the group on its header and expands it back", async () => {
    const user = userEvent.setup();
    renderSection(5);
    // Every group starts expanded — all five rows are mounted.
    expect(screen.getByText("skill-4")).toBeInTheDocument();

    await user.click(header("acme/batch", 5));
    await waitFor(() =>
      expect(screen.queryByText("skill-4")).not.toBeInTheDocument(),
    );
    // The header itself never folds away.
    expect(header("acme/batch", 5)).toBeInTheDocument();

    await user.click(header("acme/batch", 5));
    expect(await screen.findByText("skill-4")).toBeInTheDocument();
  });

  it("previews a long group behind an expander", async () => {
    const user = userEvent.setup();
    renderSection(8);

    // No layout in jsdom, so the fixed fallback previews six rows: the rest
    // wait behind the expander rather than one group dominating the page.
    expect(screen.getByText("skill-5")).toBeInTheDocument();
    expect(screen.queryByText("skill-6")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开其余 2 个" }));
    expect(await screen.findByText("skill-7")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "收起" }));
    await waitFor(() =>
      expect(screen.queryByText("skill-6")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("skill-5")).toBeInTheDocument();
    // Exactly six rows mount while folded, and the header still names the
    // group's full count.
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(header("acme/batch", 8)).toBeInTheDocument();
  });

  it("previews two rows of the current layout, not a fixed count", async () => {
    const user = userEvent.setup();
    const { container } = renderSection(10);
    expect(screen.queryByText("skill-6")).not.toBeInTheDocument();

    // ...until the grid reports a real layout. The component reads the resolved
    // grid-template-columns (one track per column); four tracks make the preview
    // two rows = eight rows. Setting it inline works for both jsdom's computed
    // style and a real browser.
    const grid = container.querySelector("ul") as HTMLElement;
    grid.style.gridTemplateColumns = "280px 280px 280px 280px";

    // The measurement re-runs when the expander settles back down (the same
    // re-run re-arms it after a fold/unfold cycle).
    await user.click(screen.getByRole("button", { name: "展开其余 4 个" }));
    await user.click(screen.getByRole("button", { name: "收起" }));

    expect(await screen.findByText("skill-7")).toBeInTheDocument();
    expect(screen.queryByText("skill-8")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "展开其余 2 个" }),
    ).toBeInTheDocument();
  });

  it("keeps a pinned header under the pointer when it is collapsed", () => {
    const { container } = renderSection(50);
    const head = header("acme/batch", 50);
    const scrollBox = container.querySelector(".overflow-y-auto") as HTMLElement;
    scrollBox.scrollTop = 500;

    // While pinned, the header sits at the container's top edge (60px below the
    // window top); once its cards are gone it snaps 200px up to its natural
    // position. The shell must compensate so the header — just clicked — stays
    // where the pointer met it.
    vi.spyOn(head, "getBoundingClientRect")
      .mockReturnValueOnce({ top: 60 } as DOMRect)
      .mockReturnValueOnce({ top: -140 } as DOMRect);
    const raf = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });

    fireEvent.click(head);
    expect(screen.queryByText("skill-0")).not.toBeInTheDocument();
    // 500 scrolled, minus the 200px upward snap = the header holds still.
    expect(scrollBox.scrollTop).toBe(300);

    raf.mockRestore();
    vi.spyOn(head, "getBoundingClientRect").mockRestore();
  });

  it("keeps a pinned header under the pointer when the preview is collapsed", async () => {
    const user = userEvent.setup();
    const { container } = renderSection(50);
    const head = header("acme/batch", 50);
    const scrollBox = container.querySelector(".overflow-y-auto") as HTMLElement;
    scrollBox.scrollTop = 500;

    // Expand the rest so the preview affordance reads 收起 — the very button
    // the reader clicks after opening every skill of a big group.
    await user.click(screen.getByRole("button", { name: /^展开其余/ }));
    const expander = screen.getByRole("button", { name: "收起" });

    vi.spyOn(head, "getBoundingClientRect")
      .mockReturnValueOnce({ top: 60 } as DOMRect)
      .mockReturnValueOnce({ top: -140 } as DOMRect);
    const raf = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });

    fireEvent.click(expander);
    expect(scrollBox.scrollTop).toBe(300);

    raf.mockRestore();
    vi.spyOn(head, "getBoundingClientRect").mockRestore();
  });
});
