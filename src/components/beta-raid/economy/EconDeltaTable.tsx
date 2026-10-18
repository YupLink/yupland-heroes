// Таблица Дельт: игрок · валюта · + · − · нетто · сделок · навар.
// Клик по строке раскрывает разрез по видам (byKind), клик по имени —
// ленту игрока (через onFeed). Сортировка — по заголовкам «Нетто»/«Навар».
import { Fragment } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { DeltaRow, KindAmount } from "@/lib/econ/types";
import { fmt } from "./economyFormat";
import { econCurrencyLabel, groupLabel } from "./econLabels";
import { PlayerName, Signed, TH_UNDER_BAR } from "./EconShared";

export type DeltaSort = { key: "net" | "margin"; desc: boolean };

/** Ключ строки: игрок × валюта — одна пара встречается один раз. */
function deltaKey(r: DeltaRow): string {
  return `${r.accountId}|${r.currency}`;
}

export function EconDeltaTable({
  rows,
  sort,
  onSort,
  expanded,
  onToggle,
  onFeed,
}: {
  rows: DeltaRow[];
  sort: DeltaSort;
  onSort: (key: DeltaSort["key"]) => void;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onFeed: (r: DeltaRow) => void;
}) {
  const t = useT();
  const arrow = sort.desc ? "↓" : "↑";
  const sortTh = (key: DeltaSort["key"], label: string) => (
    <th
      onClick={() => onSort(key)}
      className={cn(
        TH_UNDER_BAR,
        "cursor-pointer text-right",
        sort.key === key && "text-foreground",
      )}
    >
      {label}
      {sort.key === key ? ` ${arrow}` : ""}
    </th>
  );

  return (
    <table className="min-w-full border-collapse text-[12px]">
      <thead className="text-[10px] uppercase text-muted-foreground">
        <tr>
          <th className={cn(TH_UNDER_BAR, "w-8 text-center")}>№</th>
          <th className={cn(TH_UNDER_BAR, "text-left")}>{t("econ.col.player")}</th>
          <th className={cn(TH_UNDER_BAR, "text-left")}>{t("econ.col.currency")}</th>
          <th className={cn(TH_UNDER_BAR, "text-right")}>+</th>
          <th className={cn(TH_UNDER_BAR, "text-right")}>−</th>
          {sortTh("net", t("econ.col.net"))}
          <th className={cn(TH_UNDER_BAR, "text-right")}>{t("econ.col.trades")}</th>
          {sortTh("margin", t("econ.col.margin"))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => {
          const key = deltaKey(r);
          const open = expanded.has(key);
          return (
            <Fragment key={key}>
              <tr
                onClick={() => onToggle(key)}
                className={cn(
                  "cursor-pointer border-b border-border/60 transition hover:bg-secondary/40",
                  open && "bg-secondary/50",
                )}
              >
                <td className="px-2 py-1.5 text-center text-[11px] tabular-nums text-muted-foreground">
                  {idx + 1}
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    {open ? (
                      <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    )}
                    <PlayerName name={r.displayName} onClick={() => onFeed(r)} />
                  </div>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  {econCurrencyLabel(t, r.currency)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-emerald-300">
                  {r.earned === 0 ? "·" : fmt(r.earned)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-red-300">
                  {r.spent === 0 ? "·" : fmt(r.spent)}
                </td>
                <td className="px-2 py-1.5 text-right font-semibold">
                  <Signed v={r.net} />
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {r.trades === 0 ? "·" : fmt(r.trades)}
                </td>
                <td className="px-2 py-1.5 text-right font-semibold">
                  <Signed v={r.margin} />
                </td>
              </tr>
              {open && (
                <tr>
                  <td colSpan={8} className="border-b border-border/60 bg-secondary/20 p-2">
                    <ByKind items={r.byKind} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/** Разрез по видам: группа → сумма, внутри группы — сырые kind'ы. */
function ByKind({ items }: { items: KindAmount[] }) {
  const t = useT();
  if (items.length === 0) {
    return <div className="text-[11px] text-muted-foreground">{t("econ.none")}</div>;
  }
  const groups = new Map<string, { sum: number; n: number; kinds: KindAmount[] }>();
  for (const k of items) {
    const g = groups.get(k.group) ?? { sum: 0, n: 0, kinds: [] };
    g.sum += k.amount;
    g.n += k.n;
    g.kinds.push(k);
    groups.set(k.group, g);
  }
  const list = [...groups.entries()].sort((a, b) => Math.abs(b[1].sum) - Math.abs(a[1].sum));
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:grid-cols-3">
      {list.map(([group, g]) => (
        <div key={group} className="rounded-lg border border-border bg-background px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-semibold">
              {groupLabel(t, group as KindAmount["group"])}
            </span>
            <Signed v={g.sum} className="text-[12px] font-semibold" />
          </div>
          <div className="mt-0.5 space-y-0.5">
            {g.kinds.map((k) => (
              <div
                key={k.kind}
                className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground"
              >
                <span className="truncate">
                  {k.kind} <span className="opacity-60">×{k.n}</span>
                </span>
                <Signed v={k.amount} className="text-[10px]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
