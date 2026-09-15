import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "../components/ui/toast";

import {
  fetchAgentStatus,
  linkAllAgents,
} from "../lib/local-skills";
import { getExcludedAgents } from "../lib/agent-link-preferences";
import { errorMessage } from "../lib/utils";
import { INSTALLED_SKILLS_QUERY_KEY } from "./use-installed-skills";
import { formatLinkMessage } from "../pages/my-skills/link-notice";

/**
 * Link every detected agent automatically — the default state is the desired
 * state, so the user never has to understand or act on "linking".
 *
 * Mounted once at the app root. It shares the `["agent-status"]` query with
 * the my-skills avatar menu, and every time a scan lands it links the
 * unlinked, non-canonical agents that the user has not explicitly excluded
 * (see `agent-link-preferences`). A successful run is silent — the toast on
 * the linked agents' own surface would only repeat what the green dots already
 * say — while per-agent failures and hard errors do surface, aggregated into
 * one toast.
 *
 * Each agent is attempted at most once per session, so a failed or refused
 * link is reported once instead of retried on every refetch (the settings
 * dialog is the retry path); an agent installed mid-session is picked up by
 * the next scan. The exclusion list is re-read per scan, so agents unlinked
 * through the settings dialog are skipped from the moment the unlink lands.
 */
export function useAutoLinkAgents() {
  const queryClient = useQueryClient();
  const attemptedRef = useRef<Set<string>>(new Set());

  const { data: agents } = useQuery({
    queryKey: ["agent-status"],
    queryFn: fetchAgentStatus,
  });

  const autoLink = useMutation({
    mutationFn: (names: string[]) => linkAllAgents(names),
    onSuccess: (results) => {
      void queryClient.invalidateQueries({ queryKey: ["agent-status"] });
      void queryClient.invalidateQueries({
        queryKey: INSTALLED_SKILLS_QUERY_KEY,
      });
      // Silent success by design; only the failures speak, each with the
      // same per-agent wording the manual flows use.
      const failures = results.filter(
        (r) => r.status === "failed" || r.status === "refused",
      );
      if (failures.length > 0) {
        const detail = failures
          .map((r) => formatLinkMessage(r)?.text ?? `${r.display} 失败`)
          .join("；");
        toast.add({
          title: `自动链接部分 agent 失败：${detail}`,
          type: "error",
        });
      }
    },
    onError: (err) =>
      toast.add({
        title: `自动链接 agent 失败：${errorMessage(err)}`,
        type: "error",
      }),
  });

  useEffect(() => {
    if (!agents || autoLink.isPending) return;
    const excluded = new Set(getExcludedAgents());
    const candidates = agents
      .filter(
        (agent) =>
          !agent.linked &&
          !agent.canonical &&
          !excluded.has(agent.name) &&
          // At most one attempt per agent per session: see the doc comment.
          !attemptedRef.current.has(agent.name),
      )
      .map((agent) => agent.name);
    if (candidates.length === 0) return;
    candidates.forEach((name) => attemptedRef.current.add(name));
    autoLink.mutate(candidates);
    // The effect owns the scan-triggered decision; the mutation is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents]);
}
