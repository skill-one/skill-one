import { describe, it, expect, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import {
  INSTALLED_SKILLS_QUERY_KEY,
  PROVENANCE_QUERY_KEY,
  markSkillsChanged,
} from "./use-installed-skills";

describe("markSkillsChanged", () => {
  it("invalidates the local installed-skills and provenance queries", async () => {
    const client = new QueryClient();
    const spy = vi
      .spyOn(client, "invalidateQueries")
      .mockImplementation(async () => {});

    await markSkillsChanged(client);

    expect(spy).toHaveBeenCalledWith({ queryKey: INSTALLED_SKILLS_QUERY_KEY });
    expect(spy).toHaveBeenCalledWith({ queryKey: PROVENANCE_QUERY_KEY });
  });
});
