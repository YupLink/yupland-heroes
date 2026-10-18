// Ресурс: движение одной валюты за окно — сколько сейчас у игроков, откуда
// приходит и куда уходит, по дням, кто больше всех получил/потратил.
//
// Список валют в select: базовый набор + всё, что видел отчёт Дельт по всем
// валютам (тот же ключ запроса, что у вкладки Дельт с «все валюты», — из
// кэша, без второго похода на сервер, если админ уже заглядывал туда).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import type { EconRange } from "@/lib/econ/types";
import { adminEconDeltas } from "@/server/api/beta-raid/econ/deltas";
import { adminEconResource } from "@/server/api/beta-raid/econ/resource";
import { fmt } from "./economyFormat";
import { econCurrencyLabel } from "./econLabels";
import { DaysTable, KindColumn, TopList } from "./EconResourceParts";
import { EconError, EconSpinner, FILTER_BAR, SELECT } from "./EconShared";

const BASE_CURRENCIES = [
  "gold",
  "wood",
  "stone",
  "diamonds",
  "tickets",
  "likes",
  "Energy",
  "Darai",
  "GJ",
  "USDT",
];

export function EconResourceTab({ range }: { range: EconRange }) {
  const t = useT();
  const [currency, setCurrency] = useState("gold");

  const deltas = useQuery({
    queryKey: ["admin-econ", "delta", range, ""],
    queryFn: () => adminEconDeltas({ data: { range } }),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
  const currencies = useMemo(() => {
    const s = new Set<string>(BASE_CURRENCIES);
    for (const c of deltas.data?.currencies ?? []) s.add(c);
    s.add(currency);
    return [...s];
  }, [deltas.data?.currencies, currency]);

  const q = useQuery({
    queryKey: ["admin-econ", "resource", range, currency],
    queryFn: () => adminEconResource({ data: { range, currency } }),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
  const r = q.data;

  return (
    <div>
      <div className={FILTER_BAR}>
        <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={SELECT}>
          {currencies.map((c) => (
            <option key={c} value={c}>
              {econCurrencyLabel(t, c)}
            </option>
          ))}
        </select>
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
          {t("econ.supply_now")}:{" "}
          <b className="tabular-nums text-foreground">
            {r ? (r.supplyNow == null ? t("econ.unknown") : fmt(r.supplyNow)) : "…"}
          </b>
        </span>
      </div>

      {q.isLoading || !r ? (
        q.error ? (
          <EconError error={q.error} />
        ) : (
          <EconSpinner />
        )
      ) : (
        <div className="space-y-3 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <KindColumn title={t("econ.sources")} items={r.sources} />
            <KindColumn title={t("econ.sinks")} items={r.sinks} />
          </div>

          <section className="rounded-2xl border border-border bg-secondary/20">
            <header className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("econ.by_day")}
            </header>
            <DaysTable days={r.days} />
          </section>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TopList title={t("econ.top_plus")} rows={r.topPlus} />
            <TopList title={t("econ.top_minus")} rows={r.topMinus} />
          </div>
        </div>
      )}
    </div>
  );
}
