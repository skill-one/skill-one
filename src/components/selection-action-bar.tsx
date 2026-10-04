import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import {
  CheckSquare,
  Power,
  PowerOff,
  Tag as TagIcon,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import { domainEmoji } from "../data/domains";

export interface SelectionTagOption {
  key: string;
  label: string;
  emoji?: string;
  isCustom?: boolean;
}

export interface SelectionActionBarProps {
  /** The count of selected items. */
  count: number;
  /** Total count of selectable items currently listed. */
  totalCount: number;
  /** Fired when clicking select-all. */
  onSelectAll: () => void;
  /** Fired when exiting selection mode or clearing selection. */
  onClear: () => void;
  /** Fired when requesting bulk enable. */
  onEnable?: () => void;
  /** Fired when requesting bulk disable. */
  onDisable?: () => void;
  /** Fired when picking a tag for bulk assignment. null means reset tag. */
  onTag?: (tagKey: string | null) => void;
  /** Fired when creating and immediately assigning a new custom tag. */
  onCreateTag?: (label: string) => Promise<void> | void;
  /** List of tags available to assign. */
  availableTags?: SelectionTagOption[];
  /** Fired when bulk removal is confirmed. */
  onDelete?: () => void;
  /** Whether an asynchronous bulk action is in flight. */
  loading?: boolean;
}

/**
 * A floating pill action dock that slides up when multi-selection is active.
 * Houses count stats, select-all control, and bulk operations (enable, disable,
 * tag, uninstall).
 */
export function SelectionActionBar({
  count,
  totalCount,
  onSelectAll,
  onClear,
  onEnable,
  onDisable,
  onTag,
  onCreateTag,
  availableTags = [],
  onDelete,
  loading = false,
}: SelectionActionBarProps) {
  const { t } = useTranslation();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [newTagDraft, setNewTagDraft] = useState("");

  const visible = count > 0;
  const isAllSelected = count > 0 && count === totalCount;

  const customTags = availableTags.filter((t) => t.isCustom !== false);
  const systemTags = availableTags.filter((t) => t.isCustom === false);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = newTagDraft.trim();
    if (!val || !onCreateTag) return;
    await onCreateTag(val);
    setNewTagDraft("");
    setTagPopoverOpen(false);
  };

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.aside
            key="selection-dock"
            initial={{ y: 50, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex max-w-[95vw] items-center gap-1.5 rounded-full border border-border/80 bg-background/95 px-3.5 py-1.5 shadow-2xl backdrop-blur-md supports-[backdrop-filter]:bg-background/85"
            role="toolbar"
            aria-label={t("multiSelect.selectedCount", { count })}
          >
            {/* Selection badge and count */}
            <div className="flex items-center gap-2 pl-1 pr-1 text-sm font-medium">
              <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {count}
              </span>
              <span className="hidden sm:inline text-xs text-muted-foreground">
                {t("multiSelect.selectedCount", { count })}
              </span>
            </div>

            {/* Select all toggle button */}
            {!isAllSelected && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onSelectAll}
                disabled={loading}
              >
                <CheckSquare className="size-3.5" />
                <span className="hidden md:inline">{t("multiSelect.selectAll")}</span>
              </Button>
            )}

            <Separator orientation="vertical" className="h-4" />

            {/* Bulk actions group */}
            <div className="flex items-center gap-1">
              {onEnable && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={onEnable}
                  disabled={loading}
                  title={t("multiSelect.enable")}
                >
                  <Power className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="hidden sm:inline">{t("multiSelect.enable")}</span>
                </Button>
              )}

              {onDisable && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={onDisable}
                  disabled={loading}
                  title={t("multiSelect.disable")}
                >
                  <PowerOff className="size-3.5 text-amber-600 dark:text-amber-400" />
                  <span className="hidden sm:inline">{t("multiSelect.disable")}</span>
                </Button>
              )}

              {(onTag || onCreateTag) && (
                <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                  <PopoverTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={loading}
                        title={t("multiSelect.tag")}
                      >
                        <TagIcon className="size-3.5" />
                        <span className="hidden sm:inline">{t("multiSelect.tag")}</span>
                      </Button>
                    }
                  />
                  <PopoverContent
                    align="center"
                    side="top"
                    className="w-60 p-2 text-xs"
                  >
                    {onCreateTag && (
                      <form
                        onSubmit={handleCreateSubmit}
                        className="mb-2 flex items-center gap-1.5"
                      >
                        <Input
                          value={newTagDraft}
                          onChange={(e) => setNewTagDraft(e.target.value)}
                          placeholder={t("tag.newPlaceholder")}
                          className="h-7 text-xs flex-1"
                          disabled={loading}
                        />
                        <Button
                          type="submit"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs shrink-0"
                          disabled={loading || !newTagDraft.trim()}
                        >
                          {t("tag.create")}
                        </Button>
                      </form>
                    )}

                    <div className="max-h-60 overflow-y-auto space-y-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-xs font-normal h-7"
                        onClick={() => {
                          onTag?.(null);
                          setTagPopoverOpen(false);
                        }}
                      >
                        {t("tag.clear")}
                      </Button>

                      {customTags.length > 0 && (
                        <>
                          <div className="px-2 pt-1.5 pb-0.5 text-[10px] font-medium text-muted-foreground/70">
                            {t("tag.customGroup")}
                          </div>
                          {customTags.map((tag) => (
                            <Button
                              key={tag.key}
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start text-xs font-normal h-7 gap-1.5"
                              onClick={() => {
                                onTag?.(tag.key);
                                setTagPopoverOpen(false);
                              }}
                            >
                              <span className="text-sm leading-none">
                                {tag.emoji ?? domainEmoji([tag.key])}
                              </span>
                              <span className="truncate">{tag.label}</span>
                            </Button>
                          ))}
                        </>
                      )}

                      {systemTags.length > 0 && (
                        <>
                          <div className="px-2 pt-2 pb-0.5 text-[10px] font-medium text-muted-foreground/70">
                            {t("tag.systemGroup")}
                          </div>
                          {systemTags.map((tag) => (
                            <Button
                              key={tag.key}
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start text-xs font-normal h-7 gap-1.5"
                              onClick={() => {
                                onTag?.(tag.key);
                                setTagPopoverOpen(false);
                              }}
                            >
                              <span className="text-sm leading-none">
                                {tag.emoji ?? domainEmoji([tag.key])}
                              </span>
                              <span className="truncate">{tag.label}</span>
                            </Button>
                          ))}
                        </>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={loading}
                  title={t("multiSelect.uninstall")}
                >
                  <Trash2 className="size-3.5" />
                  <span className="hidden sm:inline">{t("multiSelect.uninstall")}</span>
                </Button>
              )}
            </div>

            <Separator orientation="vertical" className="h-4" />

            {/* Cancel/exit button */}
            <Button
              variant="ghost"
              size="icon-xs"
              className="size-6 rounded-full text-muted-foreground hover:text-foreground"
              onClick={onClear}
              title={t("multiSelect.clearSelection")}
              aria-label={t("multiSelect.clearSelection")}
            >
              <X className="size-3.5" />
            </Button>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("multiSelect.uninstallConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("multiSelect.uninstallConfirmDescription", { count })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={loading}
            >
              {t("common.back")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setDeleteDialogOpen(false);
                onDelete?.();
              }}
              disabled={loading}
            >
              {t("multiSelect.uninstall")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
