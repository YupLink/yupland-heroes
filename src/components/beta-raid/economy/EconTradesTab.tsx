// Сделки: сверху цепочки «купил → продал», ниже — сырой журнал с «Ещё».
// Фильтр по игроку — текстовое поле, режет строки на клиенте (имя игрока
// или контрагента); источник — select, уходит на сервер (он же ключ запроса).
// Цепочки сервер считает по всему окну и кладёт только в первую страницу
// («Ещё» листает одни строки) — берём их из pages[0].
import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { EconRange, TradeSource, TradesReport } from "@/lib/econ/types";
import { adminEconTrades } from "@/server/api/beta-raid/econ/trades";
import { sourceLabel } from "./econLabels";
import { EconChainsList } from "./EconChainsList";
import { EconTradesTable } from "./EconTradesTable";
import {
  EconEmpty,
  EconError,
  EconMore,
  EconSpinner,
  FILTER_BAR,
  SELECT,
  TEXT_INPUT,
} from "./EconShared";

const SOURCES: TradeSource[] = [
  "market",
  "market_sell",
  "town",
  "chip_market",
  "wh_take",
  "wh_put",
  "gate",
  "portal",
  "tour",
  "field",
  "chest",
  "chest_plunder",
  "loot_bag",
  "plain_chest",
  "mystic",
  "fish",
  "drink",
];

const PAGE = 100;

export function EconTradesTab({ range }: { range: EconRange }) {
  const t = useT();
  const [search, setSearch] = useState("");
  // '' — все источники.
  const [source, setSource] = useState<TradeSource | "">("");

  const q = useInfiniteQuery({
    queryKey: ["admin-econ", "trades", range, source],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      adminEconTrades({
        data: {
          range,
          source: source || undefined,
          cursor: pageParam ?? undefined,
          limit: PAGE,
        },
      }),
    getNextPageParam: (last: TradesReport) => last.nextCursor ?? undefined,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const pages = q.data?.pages;
  const needle = search.trim().toLowerCase();
  const chains = useMemo(() => {
    const all = pages?.[0]?.chains ?? [];
    if (!needle) return all;
    return all.filter((c) => c.displayName.toLowerCase().includes(needle));
  }, [pages, needle]);
  const rows = useMemo(() => {
    const all = (pages ?? []).flatMap((p) => p.rows);
    if (!needle) return all;
    return all.filter(
      (r) =>
        r.displayName.toLowerCase().includes(needle) ||
        (r.counterpartyName ?? "").toLowerCase().includes(needle) ||
        r.accountId.toLowerCase().includes(needle),
    );
  }, [pages, needle]);

  return (
    <div>
      <div className={FILTER_BAR}>
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("econ.filter.player")}
          className={TEXT_INPUT}
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as TradeSource | "")}
          className={SELECT}
        >
          <option value="">{t("econ.filter.source_all")}</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {sourceLabel(t, s)}
            </option>
          ))}
        </select>
      </div>

      {q.isLoading ? (
        <EconSpinner />
      ) : q.error ? (
        <EconError error={q.error} />
      ) : (
        <>
          <section className="border-b border-border">
            <header className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("econ.chains")} · {chains.length}
            </header>
            <EconChainsList chains={chains} onPlayer={(c) => setSearch(c.displayName)} />
          </section>

          <header className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("econ.raw_trades")} · {rows.length}
          </header>
          {rows.length === 0 ? (
            <EconEmpty text={t("econ.no_trades")} />
          ) : (
            <EconTradesTable rows={rows} />
          )}
          {q.hasNextPage && (
            <EconMore onClick={() => void q.fetchNextPage()} loading={q.isFetchingNextPage} />
          )}
        </>
      )}
    </div>
  );
}
