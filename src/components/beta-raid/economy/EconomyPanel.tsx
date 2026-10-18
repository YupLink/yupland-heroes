// Панель «$ Экономика»: восемь вкладок + общий переключатель периода.
// Раскрывается ПОД КАРТОЙ (BetaRaidScreen), выше нижних панелей (Турнир,
// Корабль). Не блокирует карту — она работает в штатном режиме, тап по
// клетке в этой панели центрирует карту, но панель НЕ закрывает.
// Только для админа — сервер тоже проверяет; клиент прячет заранее.
//
// Две семьи вкладок (см. economyTabs.ts): сводка (один запрос
// getEconomyOverview с period, автообновление) и отчёты «как на ладони»
// (каждая вкладка — свой запрос с окном EconRange, без автообновления:
// отчёты тяжелее сводки, а листать их — не «мониторить»).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { getEconomyOverview } from "@/server/api/beta-raid/admin-economy";
import { toggleEconomyOpen } from "../economyOpenBus";
import { ECONOMY_TABS, isOverviewTab, tabLabel, type EconomyTab } from "./economyTabs";
import { useEconRange } from "./useEconRange";
import { EconCustomRangeRow, EconPeriodButtons } from "./EconPeriodPicker";
import { EconomyGoodsTab } from "./EconomyGoodsTab";
import { EconomyPlayersTab } from "./EconomyPlayersTab";
import { EconomyTownsTab } from "./EconomyTownsTab";
import { EconomyPricesTab } from "./EconomyPricesTab";
import { EconDeltaTab } from "./EconDeltaTab";
import { EconResourceTab } from "./EconResourceTab";
import { EconTradesTab } from "./EconTradesTab";
import { EconLoopholesTab } from "./EconLoopholesTab";

export function EconomyPanel() {
  const t = useT();
  const [tab, setTab] = useState<EconomyTab>("goods");
  const rangeState = useEconRange("7d");
  const { period, range } = rangeState;
  const overview = isOverviewTab(tab);
  const close = () => toggleEconomyOpen(false);

  const q = useQuery({
    // period входит в ключ: смена окна должна перезагрузить данные.
    queryKey: ["admin-economy", period],
    queryFn: () => getEconomyOverview({ data: { period } }),
    // Кэш на клиенте согласован с серверным (30с): открывать вкладки —
    // мгновенно, не ловя лоадер на каждом переключении. Плюс автообновление
    // раз в 15с — «мониторить в режиме реального времени» (это же inline
    // панель под картой, а не модалка, — обновлять по месту, не по клику).
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
    // На вкладках-отчётах сводку не гоняем: их запросы и так тяжелее.
    enabled: overview,
  });

  return (
    <div className="mx-2 my-1 flex max-h-[55dvh] flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Админ · сводка
          </div>
          <h3 className="truncate font-display text-base font-bold">$ Экономика</h3>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <EconPeriodButtons state={rangeState} />
          <button
            onClick={close}
            aria-label="Свернуть"
            className="ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <EconCustomRangeRow state={rangeState} overviewTab={overview} overviewPeriod={period} />

      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
        {ECONOMY_TABS.map((def) => (
          <button
            key={def.key}
            type="button"
            onClick={() => setTab(def.key)}
            className={cn(
              "whitespace-nowrap rounded-lg border px-2.5 py-1 text-[12px] font-semibold transition",
              tab === def.key
                ? "border-gold/60 bg-gold/10 text-gold"
                : "border-border text-muted-foreground",
            )}
          >
            {tabLabel(def, t)}
          </button>
        ))}
      </div>

      {/* overflow-auto (не только -y): чтобы у таблиц был ОДИН скролл-
          контейнер сразу на две оси. Иначе вложенный overflow-x-auto у
          таблицы забирал sticky-контекст, и заголовок «уплывал» при
          прокрутке вниз — оставался внутри своего мини-скролла и не липнул
          к верху панели. Отчёты живут в том же контейнере по той же причине. */}
      <div className="min-h-0 flex-1 overflow-auto">
        {!overview ? (
          tab === "delta" ? (
            <EconDeltaTab range={range} />
          ) : tab === "resource" ? (
            <EconResourceTab range={range} />
          ) : tab === "trades" ? (
            <EconTradesTab range={range} />
          ) : (
            <EconLoopholesTab range={range} />
          )
        ) : q.isLoading || !q.data ? (
          q.error ? (
            <div className="p-4 text-sm text-red-400">
              Ошибка: {String((q.error as Error).message ?? q.error)}
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-gold" />
            </div>
          )
        ) : tab === "goods" ? (
          <EconomyGoodsTab goods={q.data.goods} />
        ) : tab === "players" ? (
          <EconomyPlayersTab players={q.data.players} currencies={q.data.currencies} />
        ) : tab === "towns" ? (
          <EconomyTownsTab towns={q.data.towns} />
        ) : (
          <EconomyPricesTab goods={q.data.priceGoods} period={period} />
        )}
      </div>
    </div>
  );
}
