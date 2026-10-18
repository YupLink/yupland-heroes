// Таблица игроков в Экономике: слева — номер строки (1..N по текущему
// порядку) и липкий блок «Игрок»; дальше валюты (сервер отдаёт их уже
// в нужном порядке: деньги/токены слева, товары справа), справа — активность.
// Заголовок таблицы закреплён — при прокрутке всегда видно, какая колонка
// какая.
//
// «БОС» и другие текстовые шорткоды в заголовке убраны: если у валюты нет
// картинки — рисуем пустую плашку, но не подпись, чтобы не создавать иллюзию
// одинаковых столбцов. Наведение по столбцу даёт полное имя (title).
import { Fragment } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlayerRow } from "@/server/api/beta-raid/admin-economy-types";
import type { CurrencyDef } from "./EconomyCurrencyPicker";
import { PlayerDetails, type CurrencyMeta } from "./EconomyPlayerParts";
import { fmt } from "./economyFormat";
import { CurrencyIcon } from "./CurrencyIcon";

export type PlayerSort =
  | { kind: "active"; desc: boolean }
  | { kind: "name"; desc: boolean }
  | { kind: "currency"; key: string; desc: boolean };

function balOf(p: PlayerRow, key: string): number {
  return p.balances.find((b) => b.currency === key)?.amount ?? 0;
}

/** Верхняя граница sticky-заголовка = высота панели фильтра над таблицей.
 *  Фиксируем как константу — фильтр всегда одностроковый (см. PlayersTab). */
const HEADER_TOP = "top-[48px]";

export function EconomyPlayersTable({
  rows,
  cols,
  currencyMap,
  sort,
  onFlipName,
  onFlipActive,
  onFlipCurrency,
  expanded,
  onToggle,
}: {
  rows: PlayerRow[];
  cols: CurrencyDef[];
  currencyMap: Map<string, CurrencyMeta>;
  sort: PlayerSort;
  onFlipName: () => void;
  onFlipActive: () => void;
  onFlipCurrency: (k: string) => void;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const nameActive = sort.kind === "name";
  const activeActive = sort.kind === "active";
  const arrow = sort.desc ? "↓" : "↑";

  return (
    // Никаких overflow-* тут: скролл (и по x, и по y) держит родитель в
    // EconomyPanel; свой контейнер сломал бы sticky-заголовок.
    <div>
      <table className="min-w-full border-collapse text-[12px]">
        <thead className="text-[10px] uppercase text-muted-foreground">
          <tr>
            <th
              className={cn(
                "sticky left-0 z-30 w-10 border-b border-r border-border bg-background px-2 py-2 text-center font-semibold",
                HEADER_TOP,
              )}
            >
              №
            </th>
            <th
              onClick={onFlipName}
              className={cn(
                "sticky left-10 z-30 cursor-pointer border-b border-r border-border bg-background px-3 py-2 text-left font-semibold",
                HEADER_TOP,
                nameActive && "text-foreground",
              )}
            >
              Игрок{nameActive ? ` ${arrow}` : ""}
            </th>
            {cols.map((c) => {
              const active = sort.kind === "currency" && sort.key === c.key;
              return (
                <th
                  key={c.key}
                  onClick={() => onFlipCurrency(c.key)}
                  className={cn(
                    "sticky z-20 cursor-pointer border-b border-border bg-background px-2 py-2 text-right font-semibold",
                    HEADER_TOP,
                    active && "text-foreground",
                  )}
                  title={c.label}
                >
                  <div className="flex items-center justify-end gap-1">
                    <CurrencyIcon currencyKey={c.key} image={c.image} label={c.label} />
                    {active && arrow}
                  </div>
                </th>
              );
            })}
            <th
              onClick={onFlipActive}
              className={cn(
                "sticky z-20 cursor-pointer border-b border-border bg-background px-2 py-2 text-right font-semibold",
                HEADER_TOP,
                activeActive && "text-foreground",
              )}
            >
              Активен{activeActive ? ` ${arrow}` : ""}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, idx) => {
            const open = expanded.has(p.accountId);
            return (
              <Fragment key={p.accountId}>
                <tr
                  onClick={() => onToggle(p.accountId)}
                  className={cn(
                    "cursor-pointer border-b border-border/60 transition hover:bg-secondary/40",
                    open ? "bg-secondary/50" : "bg-background",
                  )}
                >
                  <td className="sticky left-0 z-[10] w-10 border-r border-border bg-inherit px-2 py-1.5 text-center text-[11px] tabular-nums text-muted-foreground">
                    {idx + 1}
                  </td>
                  <td className="sticky left-10 z-[10] border-r border-border bg-inherit px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      {open ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-semibold">{p.displayName}</div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {p.accountId.slice(0, 14)}…
                        </div>
                      </div>
                    </div>
                  </td>
                  {cols.map((c) => {
                    const v = balOf(p, c.key);
                    return (
                      <td
                        key={c.key}
                        className={cn(
                          "px-2 py-1.5 text-right tabular-nums",
                          v === 0 && "text-muted-foreground/40",
                        )}
                      >
                        {v === 0 ? "·" : fmt(v)}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-right text-[10px] text-muted-foreground">
                    {p.lastActive ? new Date(p.lastActive).toLocaleDateString("ru-RU") : "—"}
                  </td>
                </tr>
                {open && (
                  <tr>
                    <td
                      colSpan={3 + cols.length}
                      className="border-b border-border/60 bg-secondary/20 p-2"
                    >
                      <PlayerDetails balances={p.balances} currencyMap={currencyMap} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
