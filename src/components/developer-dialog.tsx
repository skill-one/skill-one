import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Check, FolderOpen, RefreshCw } from "lucide-react";

import { useProvenanceLedger } from "../hooks/use-provenance-ledger";
import { revealProvenanceDir } from "../lib/provenance";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

/**
 * The developer viewer: displays the provenance ledger (.skill-one.jsonl)
 * in its raw, verbatim form without parsing or structured transformations.
 */
export function DeveloperDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DeveloperBody />
      </DialogContent>
    </Dialog>
  );
}

function DeveloperBody() {
  const { t } = useTranslation();
  const { data: raw, isPending, refetch, isFetching } = useProvenanceLedger();
  const [copied, setCopied] = useState(false);

  const copyRaw = async () => {
    if (!raw) return;
    await navigator.clipboard.writeText(raw);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const isEmpty = !isPending && (!raw || !raw.trim());

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("developer.title")}</DialogTitle>
        <DialogDescription>{t("developer.description")}</DialogDescription>
      </DialogHeader>

      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          disabled={!raw}
          onClick={() => void copyRaw()}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? t("developer.copied") : t("developer.copy")}
        </Button>
      </div>

      <div className="-mr-2 max-h-[56vh] overflow-y-auto pr-2">
        {isPending ? null : isEmpty ? (
          <p className="py-12 text-center text-[13px] text-muted-foreground">
            {t("developer.empty")}
          </p>
        ) : (
          <pre className="overflow-x-auto rounded-xl border border-border/70 bg-card p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-foreground">
            {raw}
          </pre>
        )}
      </div>

      <DialogFooter className="sm:justify-between">
        <Button variant="ghost" size="sm" onClick={() => void revealProvenanceDir()}>
          <FolderOpen aria-hidden />
          {t("developer.reveal")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          <RefreshCw aria-hidden className={isFetching ? "animate-spin" : undefined} />
          {t("developer.refresh")}
        </Button>
      </DialogFooter>
    </>
  );
}
