// Дельты: кто сколько получил/потратил по каждой валюте за окно и какой
// навар снял на сделках. Фильтр валюты уходит на сервер (лимит строк общий,
// «все валюты» может быть обрезан — тогда сервер ставит truncated и мы
// просим сузить). Сортировка — на клиенте, данные уже на руках.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import type { DeltaRow, EconRange } from "@/lib/econ/types";
import { adminEconDeltas } from "@/server/api/beta-raid/econ/deltas";
import { econCurrencyLabel } from "./econLabels";
import { EconDeltaTable, type DeltaSort } from "./EconDeltaTable";
import { EconPlayerFeed, type FeedTarget } from "./EconPlayerFeed";
import { EconEmpty, EconError, EconSpinner, FILTER_BAR, SELECT } from "./EconShared";

export function EconDeltaTab({ range }: { range: EconRange }) {
  const t = useT();
  // '' — все валюты; иначе ключ валюты как в report.currencies.
  const [currency, setCurrency] = useState("");
  const [sort, setSort] = useState<DeltaSort>({ key: "net", desc: true });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [feed, setFeed] = useState<FeedTarget | null>(null);

  const q = useQuery({
    queryKey: ["admin-econ", "delta", range, currency],
    queryFn: () => adminEconDeltas({ data: { range, currency: currency || undefined } }),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  // Список валют для select копится по ответам: при фильтре сервер отдаёт
  // только выбранную валюту, и без накопления select схлопывался бы до неё
  // одной — переключиться на другую валюту было бы некуда.
  const [currencies, setCurrencies] = useState<string[]>([]);
  useEffect(() => {
    const got = q.data?.currencies;
    if (!got?.length) return;
    setCurrencies((prev) => {
      const next = [...new Set([...prev, ...got])].sort();
      return next.length === prev.length ? prev : next;
    });
  }, [q.data?.currencies]);

  const rows = useMemo(() => {
    const list: DeltaRow[] = [...(q.data?.rows ?? [])];
    const dir = sort.desc ? -1 : 1;
    list.sort((a, b) => {
      if (sort.key === "net") return (a.net - b.net) * dir;
      // Навар: строки без сделок (null) — всегда внизу, при любом направлении.
      if (a.margin == null && b.margin == null) return 0;
      if (a.margin == null) return 1;
      if (b.margin == null) return -1;
      return (a.margin - b.margin) * dir;
    });
    return list;
  }, [q.data?.rows, sort]);

  const flip = (key: DeltaSort["key"]) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }));
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div>
      <div className={FILTER_BAR}>
        <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={SELECT}>
          <option value="">{t("econ.all_currencies")}</option>
          {currencies.map((c) => (
            <option key={c} value={c}>
              {econCurrencyLabel(t, c)}
            </option>
          ))}
        </select>
        <span className="hidden min-w-0 flex-1 truncate text-[10px] text-muted-foreground sm:block">
          {t("econ.delta.hint")}
        </span>
        {q.data && (
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {t("econ.rows_n", { n: rows.length })}
          </span>
        )}
      </div>

      {q.isLoading ? (
        <EconSpinner />
      ) : q.error ? (
        <EconError error={q.error} />
      ) : rows.length === 0 ? (
        <EconEmpty text={t("econ.empty")} />
      ) : (
        <>
          {q.data?.truncated && (
            <div className="border-b border-border bg-amber-950/30 px-3 py-1.5 text-[11px] text-amber-200">
              {t("econ.truncated")}
            </div>
          )}
          <EconDeltaTable
            rows={rows}
            sort={sort}
            onSort={flip}
            expanded={expanded}
            onToggle={toggle}
            onFeed={(r) => setFeed({ accountId: r.accountId, displayName: r.displayName })}
          />
        </>
      )}

      {feed && <EconPlayerFeed target={feed} range={range} onClose={() => setFeed(null)} />}
    </div>
  );
}
