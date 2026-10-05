import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { toast } from "../components/ui/toast";
import { markSkillsChanged } from "./use-installed-skills";
import { recordSkillProvenance } from "../lib/provenance";
import { errorMessage } from "../lib/utils";

/**
 * The one action behind every "confirm this source" control: the installed
 * list's suggestion badge and the detail drawer's change-source popover both
 * record the user's pick the same way, and both used to carry their own copy
 * of the write, the cache invalidation and the two toasts.
 *
 * A confirmed pick is recorded into the ledger like a native install — the
 * user's choice is the act of identification — and the installed list and the
 * provenance map are invalidated with it, so the row, the card and the drawer
 * all redraw from the new record.
 *
 * `pendingRepo` is the repo whose write is in flight: the candidate row shows a
 * spinner, and every row is disabled meanwhile.
 */
export function useConfirmSkillSource(name: string) {
  const [pendingRepo, setPendingRepo] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const confirm = useCallback(
    async (repo: string, defaultTags?: readonly string[]): Promise<boolean> => {
      setPendingRepo(repo);
      try {
        if (defaultTags && defaultTags.length > 0) {
          await recordSkillProvenance(repo, name, "confirm", defaultTags);
        } else {
          await recordSkillProvenance(repo, name, "confirm");
        }
        await markSkillsChanged(queryClient);
        toast.add({ title: t("sourceLink.linked", { repo }), type: "success" });
        return true;
      } catch (e) {
        toast.add({ title: errorMessage(e, t("sourceLink.failed")), type: "error" });
        return false;
      } finally {
        setPendingRepo(null);
      }
    },
    [name, queryClient, t],
  );

  return { pendingRepo, confirm };
}
