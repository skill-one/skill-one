import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { INSTALLED_SKILLS_QUERY_KEY } from "./use-installed-skills";
import {
  excludeAgent,
  includeAgent,
} from "../lib/agent-link-preferences";
import { linkAgent, unlinkAgent } from "../lib/local-skills";
import { errorMessage } from "../lib/utils";
import { formatLinkMessage } from "../lib/link-notice";
import { toast } from "../components/ui/toast";

/**
 * The one link/unlink action every agent surface uses (the agents graph's
 * node popover and the link settings dialog). The switch is the user's intent:
 * the exclusion is recorded before the disk action, so the auto-link pass
 * honors an opt-out even if the action fails. Every outcome invalidates the
 * agent status and installed skills, and lands as the same toast the dialog
 * has always reported.
 */
export function useAgentLinkToggle() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const toggle = useMutation({
    mutationFn: ({ name, link }: { name: string; link: boolean }) =>
      link ? linkAgent(name) : unlinkAgent(name),
    onMutate: ({ name, link }) => {
      if (link) {
        includeAgent(name);
      } else {
        excludeAgent(name);
      }
    },
    onSuccess: (results) => {
      void queryClient.invalidateQueries({ queryKey: ["agent-status"] });
      void queryClient.invalidateQueries({
        queryKey: INSTALLED_SKILLS_QUERY_KEY,
      });
      const notice = formatLinkMessage(results[0]);
      if (notice) {
        const type =
          notice.kind === "error"
            ? "error"
            : notice.kind === "warning"
              ? "warning"
              : "success";
        toast.add({ title: notice.render(t), type });
      }
    },
    onError: (err) =>
      toast.add({
        title: errorMessage(err, t("action.operationFailed")),
        type: "error",
      }),
  });

  /** Whether this agent's switch is the one currently mutating. */
  const busyFor = (name: string) =>
    toggle.isPending && toggle.variables?.name === name;

  return { toggle, busyFor };
}
