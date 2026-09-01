import { useState } from "react";

import { addProject } from "../lib/projects";
import { pickProjectDir } from "../lib/pick-project-dir";
import { isTauri } from "../lib/tauri";

/**
 * The shared "add a project" flow used by every surface that registers a
 * project (the card scope menu's 添加项目…, and the Settings page).
 *
 * On the desktop shell it opens the native folder picker and registers the
 * chosen directory; in a plain browser (no native dialog) it flips `manualOpen`
 * so the caller can render an {@link AddProjectDialog} path input instead. The
 * returned `start` is wired to any trigger; `manualOpen` / `setManualOpen`
 * drive the fallback dialog.
 */
export function useProjectAdd() {
  const [manualOpen, setManualOpen] = useState(false);

  const start = async () => {
    if (!isTauri()) {
      setManualOpen(true);
      return;
    }
    const dir = await pickProjectDir();
    if (dir) addProject(dir);
  };

  return { start, manualOpen, setManualOpen };
}
