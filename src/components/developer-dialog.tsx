import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ParseKeys } from "i18next";
import { Copy, Check, FolderOpen, RefreshCw } from "lucide-react";

import {
  useProvenanceLedger,
} from "../hooks/use-provenance-ledger";
import { revealProvenanceDir } from "../lib/provenance";
import type { LedgerLine } from "../lib/provenance";
import { useAppLocale } from "../i18n/use-language";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

type LedgerView = "structured" | "raw";

/**
 * What kind of knowledge a ledger line holds, judged by the same
 * discriminators `parseLedger` uses (`repo` present = source, `epoch`
 * present = resolution). Anything else is rendered anyway — the viewer shows
 * the file as it is — just flagged as unrecognized.
 */
type LedgerKind = "source" | "resolution" | "unknown";

function ledgerKind(record: unknown): LedgerKind {
  if (typeof record !== "object" || record === null) return "unknown";
  const entry = record as Record<string, unknown>;
  if (typeof entry.repo === "string" && entry.repo.length > 0) return "source";
  if (typeof entry.epoch === "number" && Number.isFinite(entry.epoch)) {
    return "resolution";
  }
  return "unknown";
}

const KIND_VARIANT: Record<LedgerKind, "default" | "secondary" | "outline"> = {
  source: "default",
  resolution: "secondary",
  unknown: "outline",
};

/** i18n keys for the known ledger fields; unknown fields show their raw key. */
const FIELD_KEYS: Record<string, ParseKeys> = {
  name: "developer.field.name",
  repo: "developer.field.repo",
  installedAt: "developer.field.installedAt",
  hash: "developer.field.hash",
  epoch: "developer.field.epoch",
  fingerprint: "developer.field.fingerprint",
  namesakesKey: "developer.field.namesakesKey",
  candidates: "developer.field.candidates",
  similarity: "developer.field.similarity",
  stars: "developer.field.stars",
  downloads: "developer.field.downloads",
  description: "developer.field.description",
  descriptionZh: "developer.field.descriptionZh",
  mtimeMs: "developer.field.mtimeMs",
  size: "developer.field.size",
};

/**
 * The developer viewer: the provenance ledger (`.skill-one.jsonl` in the
 * global skills directory) rendered in full, as the file actually is — every
 * line visible, in order, duplicates included, broken lines flagged rather
 * than skipped. This is a debugging surface, so it complements rather than
 * reuses `parseLedger`'s tolerant merging: the app must decide what to act
 * on, but a developer asking "why does this skill think it came from X"
 * needs to see the record the app is not acting on too.
 *
 * Two views over the same bytes: structured (one card per line, every field
 * rendered, unknown fields included) and raw JSONL text. Opened from the
 * settings menu like the activity dialog; the content remounts on open, so
 * every opening is a fresh read.
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
  const { data, isPending, refetch, isFetching } = useProvenanceLedger();
  const [view, setView] = useState<LedgerView>("structured");
  const [copied, setCopied] = useState(false);

  const raw = data?.raw ?? null;
  const lines = data?.lines ?? [];

  const copyRaw = async () => {
    if (raw === null) return;
    await navigator.clipboard.writeText(raw);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("developer.title")}</DialogTitle>
        <DialogDescription>{t("developer.description")}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          variant="outline"
          spacing={0}
          value={[view]}
          onValueChange={(values) => {
            const next = values[0] as LedgerView | undefined;
            setView(next ?? "structured");
          }}
          aria-label={t("developer.viewAria")}
        >
          <ToggleGroupItem value="structured" className="px-3">
            {t("developer.view.structured")}
          </ToggleGroupItem>
          <ToggleGroupItem value="raw" className="px-3">
            {t("developer.view.raw")}
          </ToggleGroupItem>
        </ToggleGroup>
        {!isPending && lines.length > 0 && (
          <span className="text-[12px] text-muted-foreground">
            {t("developer.recordCount", { count: lines.length })}
          </span>
        )}
      </div>

      <div className="-mr-2 max-h-[56vh] overflow-y-auto pr-2">
        {isPending ? null : lines.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-muted-foreground">
            {t("developer.empty")}
          </p>
        ) : view === "structured" ? (
          <ul className="flex flex-col gap-3">
            {lines.map((entry) => (
              <LedgerCard key={entry.line} entry={entry} />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => void copyRaw()}>
                {copied ? (
                  <Check aria-hidden />
                ) : (
                  <Copy aria-hidden />
                )}
                {copied ? t("developer.copied") : t("developer.copy")}
              </Button>
            </div>
            <pre className="overflow-x-auto rounded-xl border border-border/70 bg-card p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-foreground">
              {raw}
            </pre>
          </div>
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

/** One ledger line: a card naming the skill, its kind, and every field. */
function LedgerCard({ entry }: { entry: LedgerLine }) {
  const { t } = useTranslation();
  const locale = useAppLocale();

  // A line that did not parse stays visible, verbatim, flagged — the point
  // of the viewer is that nothing in the file is hidden from the developer.
  if (entry.text !== undefined) {
    return (
      <li className="rounded-xl border border-destructive/40 bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-destructive">
            {t("developer.unparsableLine")}
          </span>
          <LineNumber line={entry.line} />
        </div>
        <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
          {entry.text}
        </p>
      </li>
    );
  }

  const kind = ledgerKind(entry.record);
  const record = (entry.record ?? {}) as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name : null;

  return (
    <li className="rounded-xl border border-border/70 bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate font-mono text-[13px] font-medium text-foreground">
            {name ?? "—"}
          </h3>
          <Badge variant={KIND_VARIANT[kind]}>{t(KIND_KEY[kind])}</Badge>
        </div>
        <LineNumber line={entry.line} />
      </div>
      <FieldRows value={record} locale={locale} className="mt-3" />
    </li>
  );
}

/** i18n keys for the record kinds. */
const KIND_KEY: Record<LedgerKind, ParseKeys> = {
  source: "developer.kind.source",
  resolution: "developer.kind.resolution",
  unknown: "developer.kind.unknown",
};

function LineNumber({ line }: { line: number }) {
  return (
    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
      #{line}
    </span>
  );
}

/**
 * Every key of the record, in file order, fully rendered — this is the
 * "completely" part of the viewer. Known fields get their label; a field the
 * schema grows later still shows up, under its raw key, with no code change.
 */
function FieldRows({
  value,
  locale,
  className,
}: {
  value: Record<string, unknown>;
  locale: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <dl className={`grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px] ${className ?? ""}`}>
      {Object.entries(value).map(([key, field]) => (
        <div key={key} className="contents">
          <dt className="pt-0.5 whitespace-nowrap text-muted-foreground">
            {key in FIELD_KEYS ? t(FIELD_KEYS[key]) : key}
          </dt>
          <dd className="min-w-0 pt-0.5 text-foreground">
            <FieldValue value={field} locale={locale} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One value: primitives verbatim, objects as nested field rows, arrays as a
 * list of rendered items (one nested block per candidate). Values are shown
 * raw — an ISO stamp stays an ISO stamp; a developer tool should not
 * translate the bytes it is showing.
 */
function FieldValue({ value, locale }: { value: unknown; locale: string }) {
  if (value === null) return <span className="font-mono">null</span>;
  if (typeof value !== "object") {
    return <span className="break-all font-mono">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="font-mono">[]</span>;
    return (
      <ul className="flex flex-col gap-2">
        {value.map((item, index) => (
          <li
            key={index}
            className="border-l border-border pl-3"
          >
            <FieldValue value={item} locale={locale} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <FieldRows
      value={value as Record<string, unknown>}
      locale={locale}
      // Nested rows sit slightly indented under their parent field.
      className="border-l border-border pl-3"
    />
  );
}
