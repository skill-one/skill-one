import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ScopeSelect } from "./scope-select";
import { renderWithRouter } from "../../test/test-utils";
import { GLOBAL_SCOPE, projectScope } from "../../lib/skill-scope";
import type { Project } from "../../lib/projects";

const projects: Project[] = [
  { path: "/p/app", name: "app" },
  { path: "/p/web", name: "web" },
];

function render(
  props: Partial<React.ComponentProps<typeof ScopeSelect>> = {},
) {
  const onPick = vi.fn();
  const onAddProject = vi.fn();
  renderWithRouter(
    <ScopeSelect
      scope={GLOBAL_SCOPE}
      projects={projects}
      onPick={onPick}
      onAddProject={onAddProject}
      {...props}
    />,
  );
  return { onPick, onAddProject };
}

async function openMenu() {
  await userEvent.click(screen.getByRole("button"));
}

describe("ScopeSelect", () => {
  it("labels the trigger with the current scope", () => {
    render();
    expect(screen.getByRole("button")).toHaveTextContent("全局");
  });

  it("labels the trigger with the project name for a project scope", () => {
    render({ scope: projectScope("/p/web") });
    expect(screen.getByRole("button")).toHaveTextContent("web");
  });

  it("offers 全局 and every registered project, and adds one", async () => {
    const { onAddProject } = render({ scope: projectScope("/p/app") });
    await openMenu();

    expect(
      await screen.findByRole("menuitem", { name: /^全局/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "app" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "web" })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /添加项目/ }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("menuitem", { name: /添加项目/ }));
    expect(onAddProject).toHaveBeenCalled();
  });

  it("fires onPick when moving to a different scope", async () => {
    const { onPick } = render({ scope: projectScope("/p/app") });
    await openMenu();

    await userEvent.click(
      await screen.findByRole("menuitem", { name: /^全局/ }),
    );
    expect(onPick).toHaveBeenCalledWith(GLOBAL_SCOPE);
  });

  it("does not fire onPick when re-selecting the current scope", async () => {
    const { onPick } = render();
    await openMenu();

    await userEvent.click(
      await screen.findByRole("menuitem", { name: /^全局/ }),
    );
    expect(onPick).not.toHaveBeenCalled();
  });

  it("is disabled while a move is in flight", () => {
    render({ busy: true });
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
