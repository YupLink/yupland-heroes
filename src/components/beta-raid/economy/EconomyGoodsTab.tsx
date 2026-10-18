// Товары: одна строка на канонический ключ. Компакт-строка + раскрытие мест.
// Колонки: Есть / Пр./сут / Мин. продажа / Макс. скупка / Оборот (buy+sell).
// Поиск сверху фильтрует по имени. Тап по строке места центрирует карту, но
// не закрывает панель — админ сравнивает клетки, а не работает с одной.
import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GoodRow } from "@/server/api/beta-raid/admin-economy-types";
import { requestCenter } from "../centerMapBus";
import { fmt } from "./economyFormat";
import { EconomyPlacesList } from "./EconomyPlacesList";

type SortKey = "name" | "onHand" | "producePerDay" | "minSell" | "maxBuy" | "turnover";

type Extras = {
  minSell: number | null;
  maxBuy: number | null;
  turnover: number;
};

const HEAD: Array<{ key: SortKey; label: string; align?: "right"; hint?: string }> = [
  { key: "name", label: "Товар" },
  { key: "onHand", label: "Есть", align: "right" },
  { key: "producePerDay", label: "Пр/сут", align: "right", hint: "Производство за сутки" },
  { key: "minSell", label: "Мин.прод", align: "right", hint: "Минимальная цена продажи" },
  { key: "maxBuy", label: "Макс.скуп", align: "right", hint: "Максимальная цена скупки" },
  { key: "turnover", label: "Оборот", align: "right", hint: "Продано игрокам + скуплено городами" },
];

function extras(g: GoodRow): Extras {
  let minSell: number | null = null;
  let maxBuy: number | null = null;
  for (const p of g.places) {
    if (p.source !== "market" || p.price == null) continue;
    if (p.side === "sell") minSell = minSell == null ? p.price : Math.min(minSell, p.price);
    if (p.side === "buy") maxBuy = maxBuy == null ? p.price : Math.max(maxBuy, p.price);
  }
  return {
    minSell,
    maxBuy,
    turnover: (g.salesUnits || 0) + (g.townBuysUnits || 0),
  };
}

export function EconomyGoodsTab({ goods }: { goods: GoodRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "onHand",
    desc: true,
  });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");

  const decorated = useMemo(() => goods.map((g) => ({ g, x: extras(g) })), [goods]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return decorated;
    return decorated.filter(
      ({ g }) => g.name.toLowerCase().includes(q) || g.key.toLowerCase().includes(q),
    );
  }, [decorated, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const pick = (row: typeof a): number | string => {
        if (sort.key === "name") return row.g.name;
        if (sort.key === "onHand") return row.g.onHand;
        if (sort.key === "producePerDay") return row.g.producePerDay;
        if (sort.key === "minSell") return row.x.minSell ?? Infinity;
        if (sort.key === "maxBuy") return row.x.maxBuy ?? -Infinity;
        return row.x.turnover;
      };
      const av = pick(a);
      const bv = pick(b);
      if (typeof av === "string" && typeof bv === "string") {
        return sort.desc ? bv.localeCompare(av) : av.localeCompare(bv);
      }
      const na = Number(av);
      const nb = Number(bv);
      if (!Number.isFinite(na) && !Number.isFinite(nb)) return 0;
      if (!Number.isFinite(na)) return sort.desc ? 1 : -1;
      if (!Number.isFinite(nb)) return sort.desc ? -1 : 1;
      return sort.desc ? nb - na : na - nb;
    });
    return list;
  }, [filtered, sort]);

  const flip = (k: SortKey) =>
    setSort((s) => (s.key === k ? { key: k, desc: !s.desc } : { key: k, desc: true }));
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const centerOnCell = (q: number, r: number) => {
    requestCenter({ q, r, ttlMs: 3000 });
  };

  if (goods.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">Товаров пока нет.</div>;
  }

  return (
    <div>
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Найти товар…"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-[12px] outline-none focus:border-gold/60"
        />
        <span className="text-[10px] text-muted-foreground">
          {sorted.length} / {goods.length}
        </span>
      </div>

      <table className="w-full border-collapse text-[12px]">
        <thead className="sticky top-[38px] z-10 bg-background text-[10px] uppercase text-muted-foreground">
          <tr>
            {HEAD.map((h) => (
              <th
                key={h.key}
                onClick={() => flip(h.key)}
                title={h.hint}
                className={cn(
                  "cursor-pointer border-b border-border px-2 py-2 font-semibold",
                  h.align === "right" ? "text-right" : "text-left",
                  sort.key === h.key && "text-foreground",
                )}
              >
                {h.label}
                {sort.key === h.key && (sort.desc ? " ↓" : " ↑")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ g, x }) => {
            const open = expanded.has(g.key);
            return (
              <Fragment key={g.key}>
                <tr
                  onClick={() => toggle(g.key)}
                  className={cn(
                    "cursor-pointer border-b border-border/60 transition hover:bg-secondary/40",
                    open && "bg-secondary/50",
                  )}
                >
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      {open ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                      {g.image ? (
                        <img src={g.image} alt="" className="h-5 w-5 rounded object-cover" />
                      ) : (
                        <div className="h-5 w-5 rounded bg-secondary" />
                      )}
                      <span className="truncate">{g.name || g.key}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(g.onHand)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {fmt(g.producePerDay)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-emerald-300">
                    {x.minSell == null ? "·" : fmt(x.minSell)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-amber-300">
                    {x.maxBuy == null ? "·" : fmt(x.maxBuy)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                    {fmt(x.turnover)}
                  </td>
                </tr>
                {open && (
                  <tr>
                    <td
                      colSpan={HEAD.length}
                      className="border-b border-border/60 bg-secondary/20 p-2"
                    >
                      <EconomyPlacesList places={g.places} onGo={centerOnCell} />
                      <div className="mt-1.5 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                        <span>
                          Продано игрокам: <b className="text-foreground">{fmt(g.salesUnits)}</b>
                        </span>
                        <span>
                          Скуплено городами:{" "}
                          <b className="text-foreground">{fmt(g.townBuysUnits)}</b>
                        </span>
                      </div>
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
