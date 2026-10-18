// Дёшево / Дорого: свой dropdown товаров (с иконками + редкость), две колонки —
// «Купить дешевле» (side='sell', цена asc) и «Продать дороже» (side='buy',
// цена desc). Тап по строке центрирует карту, панель не сворачивается — админ
// сравнивает клетки, а не работает с одной.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getEconomyPrices } from "@/server/api/beta-raid/admin-economy";
import type {
  EconomyPeriod,
  PriceExtreme,
  PriceGood,
} from "@/server/api/beta-raid/admin-economy-types";
import { requestCenter } from "../centerMapBus";
import { fmt } from "./economyFormat";
import { EconomyGoodPicker } from "./EconomyGoodPicker";
import { RarityBadge } from "./EconomyRarity";

export function EconomyPricesTab({ goods, period }: { goods: PriceGood[]; period: EconomyPeriod }) {
  const [pick, setPick] = useState<string>(goods[0]?.key ?? "");
  useEffect(() => {
    if (!pick && goods[0]) setPick(goods[0].key);
  }, [goods, pick]);
  const good = goods.find((g) => g.key === pick) ?? goods[0];

  const q = useQuery({
    queryKey: ["admin-economy-prices", period, pick],
    queryFn: () => getEconomyPrices({ data: { period, goodKey: pick } }),
    enabled: !!pick,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { buys, sells } = useMemo(() => {
    const list: PriceExtreme[] = q.data?.extremes ?? [];
    const b = list.filter((x) => x.side === "buy").sort((a, b) => b.price - a.price);
    const s = list.filter((x) => x.side === "sell").sort((a, b) => a.price - b.price);
    return { buys: b, sells: s };
  }, [q.data]);

  const go = (qq: number, rr: number) => {
    requestCenter({ q: qq, r: rr, ttlMs: 3000 });
  };

  if (goods.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">Товаров в маркетах нет.</div>;
  }

  return (
    <div className="p-3">
      <div className="mb-3">
        <EconomyGoodPicker goods={goods} value={pick} onChange={setPick} />
      </div>

      {good && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-secondary/30 px-3 py-2">
          {good.image ? (
            <img src={good.image} alt="" className="h-8 w-8 rounded object-cover" />
          ) : (
            <div className="h-8 w-8 rounded bg-secondary" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{good.name}</div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="uppercase">{good.kind}</span>
              <RarityBadge rarity={good.rarity} />
            </div>
          </div>
        </div>
      )}

      {q.isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-gold" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PriceColumn
            title="Купить дешевле"
            variant="sell"
            image={good?.image ?? null}
            rarity={good?.rarity ?? null}
            list={sells}
            onGo={go}
          />
          <PriceColumn
            title="Продать дороже"
            variant="buy"
            image={good?.image ?? null}
            rarity={good?.rarity ?? null}
            list={buys}
            onGo={go}
          />
        </div>
      )}
    </div>
  );
}

function PriceColumn({
  title,
  variant,
  image,
  rarity,
  list,
  onGo,
}: {
  title: string;
  variant: "buy" | "sell";
  image: string | null;
  rarity: string | null;
  list: PriceExtreme[];
  onGo: (q: number, r: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-secondary/20">
      <header className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </header>
      {list.length === 0 ? (
        <div className="p-3 text-[11px] text-muted-foreground">Витрин нет.</div>
      ) : (
        <ul className="divide-y divide-border/60">
          {list.map((p, i) => (
            <li key={`${p.itemId}:${i}`}>
              <button
                type="button"
                onClick={() => onGo(p.q, p.r)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition hover:bg-secondary/40"
              >
                {image ? (
                  <img src={image} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
                ) : (
                  <div className="h-6 w-6 shrink-0 rounded bg-secondary" />
                )}
                <span className="font-mono text-gold">
                  {p.q},{p.r}
                </span>
                {rarity && <RarityBadge rarity={rarity} />}
                <span className="ml-auto tabular-nums font-semibold">{fmt(p.price)}</span>
                <span className="text-[10px] text-muted-foreground">
                  {p.priceResource}
                  {p.priceToken ? ` (${p.priceToken})` : ""}
                </span>
                {p.remaining != null && (
                  <span
                    className={`min-w-14 text-right text-[10px] ${variant === "sell" ? "text-muted-foreground" : "text-muted-foreground"}`}
                  >
                    ост. {fmt(p.remaining)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
