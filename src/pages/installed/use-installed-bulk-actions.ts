import { useCallback, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { toast } from "../../components/ui/toast";
import { errorMessage } from "../../lib/utils";
import { markSkillsChanged } from "../../hooks/use-installed-skills";
import {
  removeInstalledSkills,
  setManySkillsEnabled,
} from "../../lib/local-skills";
import {
  recordSkillProvenanceBatch,
  saveCustomTagDef,
  setManySkillTags,
  type CustomTags,
} from "../../lib/provenance";
import {
  collectTakenTagKeys,
  validateNewTag,
  type TagValidationError,
} from "../../lib/custom-tags";
import type { LinkableSkill } from "./source-link-banner";

interface UseInstalledBulkActionsProps {
  queryClient: QueryClient;
  t: TFunction;
  selectedList: string[];
  clearSelection: () => void;
  customTags?: CustomTags | null;
  linkableSkills: LinkableSkill[];
}

export function useInstalledBulkActions({
  queryClient,
  t,
  selectedList,
  clearSelection,
  customTags,
  linkableSkills,
}: UseInstalledBulkActionsProps) {
  const [bulkLoading, setBulkLoading] = useState(false);

  const getSelectedNames = () =>
    selectedList.map((k) => k.slice(k.lastIndexOf("/") + 1));

  const handleBulkEnable = async () => {
    const selectedNames = getSelectedNames();
    if (selectedNames.length === 0) return;
    setBulkLoading(true);
    try {
      await setManySkillsEnabled(selectedNames, true);
      await markSkillsChanged(queryClient);
      toast.add({
        title: t("multiSelect.enableSuccess", { count: selectedNames.length }),
        type: "success",
      });
      clearSelection();
    } catch (e) {
      toast.add({
        title: errorMessage(e, t("action.toggleFailed")),
        type: "error",
      });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDisable = async () => {
    const selectedNames = getSelectedNames();
    if (selectedNames.length === 0) return;
    setBulkLoading(true);
    try {
      await setManySkillsEnabled(selectedNames, false);
      await markSkillsChanged(queryClient);
      toast.add({
        title: t("multiSelect.disableSuccess", { count: selectedNames.length }),
        type: "success",
      });
      clearSelection();
    } catch (e) {
      toast.add({
        title: errorMessage(e, t("action.toggleFailed")),
        type: "error",
      });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkTag = async (tagKey: string | null) => {
    const selectedNames = getSelectedNames();
    if (selectedNames.length === 0) return;
    setBulkLoading(true);
    try {
      await setManySkillTags(selectedNames, tagKey);
      await markSkillsChanged(queryClient);
      toast.add({
        title: t("multiSelect.tagSuccess", { count: selectedNames.length }),
        type: "success",
      });
      clearSelection();
    } catch (e) {
      toast.add({
        title: errorMessage(e, t("tag.failed")),
        type: "error",
      });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleCreateAndApplyTag = async (label: string, emoji?: string) => {
    const selectedNames = getSelectedNames();
    if (selectedNames.length === 0) return;
    const taken = collectTakenTagKeys(
      (customTags?.tagDefs ?? []).map((def) => def.key),
    );
    const checked = validateNewTag(label, taken);
    if (!checked.ok) {
      const errMap: Record<TagValidationError, string> = {
        empty: t("tag.errorEmpty"),
        tooLong: t("tag.errorTooLong"),
        reserved: t("tag.errorReserved"),
        duplicate: t("tag.errorDuplicate"),
        emojiLong: t("tag.errorEmojiLong"),
      };
      toast.add({ title: errMap[checked.error], type: "error" });
      return;
    }
    setBulkLoading(true);
    try {
      await saveCustomTagDef(checked.key, label.trim(), emoji);
      await setManySkillTags(selectedNames, checked.key);
      await markSkillsChanged(queryClient);
      toast.add({
        title: t("multiSelect.tagSuccess", { count: selectedNames.length }),
        type: "success",
      });
      clearSelection();
    } catch (e) {
      toast.add({
        title: errorMessage(e, t("tag.failed")),
        type: "error",
      });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    const selectedNames = getSelectedNames();
    if (selectedNames.length === 0) return;
    setBulkLoading(true);
    try {
      await removeInstalledSkills(selectedNames);
      await markSkillsChanged(queryClient);
      toast.add({
        title: t("multiSelect.uninstallSuccess", { count: selectedNames.length }),
        type: "success",
      });
      clearSelection();
    } catch (e) {
      toast.add({
        title: errorMessage(e, t("action.retry")),
        type: "error",
      });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBatchLink = useCallback(
    async (
      selections: readonly {
        name: string;
        repo: string;
        defaultTags?: readonly string[];
      }[],
    ) => {
      try {
        const entries = selections.map((item) => ({
          name: item.name,
          repo: item.repo,
          reason: "confirm" as const,
          defaultTags: item.defaultTags,
        }));
        await recordSkillProvenanceBatch(entries);
        await markSkillsChanged(queryClient);
        toast.add({
          title: t("sourceLink.batchLinkSuccess", { count: entries.length }),
          type: "success",
        });
      } catch {
        toast.add({
          title: t("sourceLink.batchLinkFailed"),
          type: "error",
        });
      }
    },
    [queryClient, t],
  );

  const handleLinkAllRecommended = useCallback(async () => {
    const selections = linkableSkills.map((s) => ({
      name: s.name,
      repo: s.recommendedCandidate.skill.repo,
      defaultTags: s.recommendedCandidate.skill.profile?.domain,
    }));
    await handleBatchLink(selections);
  }, [linkableSkills, handleBatchLink]);

  return {
    bulkLoading,
    handleBulkEnable,
    handleBulkDisable,
    handleBulkTag,
    handleCreateAndApplyTag,
    handleBulkDelete,
    handleBatchLink,
    handleLinkAllRecommended,
  };
}
