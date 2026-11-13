// Лот игрока из своих вещей: ресурс, свободный артефакт или товар рюкзака
// выбранного героя (паков нет). Сколько, стартовая цена, валюта (открытые
// уровнем дома), длительность; шаг 5 % и антиснайпер 5 мин — как у лотов игры.
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createPlayerLot, myAuctionGoods } from "@/server/api/game-auction";
import {
  CountField,
  Pills,
  PrizePicker,
  RESOURCES,
  countOrThrow,
  type PrizeOption,
} from "@/components/admin/AuctionFormBits";
import { currencyLabel } from "@/lib/auctionCurrency";
import {
  PLAYER_DURATIONS,
  type PlayerDuration,
  type PlayerLotKind,
} from "@/lib/auctionHouse";
import { GOODS_KEY, refreshAuctionData } from "./auctionRefresh";

const KIND: Record<PlayerLotKind, [string, string]> = {
  resource: ["Ресурс", "Resource"],
  artifact: ["Артефакт", "Artifact"],
  custom: ["Из рюкзака", "Backpack"],
};
const DUR: Record<PlayerDuration, [string, string]> = {
  "1h": ["1 час", "1 hour"],
  "6h": ["6 ч", "6 h"],
  "12h": ["12 ч", "12 h"],
  "1d": ["1 день", "1 day"],
  "3d": ["3 дня", "3 days"],
};
const RES_EN: Record<string, string> = {
  gold: "Gold",
  stone: "Stone",
  wood: "Wood",
  diamonds: "Diamonds",
};

type Opt = PrizeOption & { max: number };

export function PlayerLotForm({
  en,
  currencies,
  onDone,
}: {
  en: boolean;
  /** За что можно продавать на этом уровне дома (getAuctionHouse). */
  currencies: string[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<PlayerLotKind>("custom");
  const [ref, setRef] = useState("");
  const [qty, setQty] = useState("1");
  const [currency, setCurrency] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState<PlayerDuration>("1d");
  const goods = useQuery({ queryKey: GOODS_KEY, queryFn: () => myAuctionGoods() });
  const i = en ? 1 : 0;

  const options = useMemo<Opt[]>(() => {
    const g = goods.data;
    if (!g) return [];
    const named = (name: string, max: number) => `${name} · ${max.toLocaleString()}`;
    if (kind === "resource") {
      return RESOURCES.map((r) => {
        const max = Math.floor(g.resources[r.ref] ?? 0);
        return { ref: r.ref, image: r.image, max, label: named(en ? RES_EN[r.ref] : r.label, max) };
      }).filter((o) => o.max >= 1);
    }
    if (kind === "artifact") {
      // Группы — шаблон и прочность: у каждой своя полоса (износ уходит с лотом).
      return g.artifacts.map((x) => ({
        ref: x.ref,
        image: x.image,
        max: x.max,
        label: named(x.name, x.max),
        durability: x.durability,
        ...(x.enchanted ? { enchant: { pct: x.enchantPct ?? 0, n: x.enchanted, total: x.max } } : {}),
      }));
    }
    return g.goods.map((x) => ({
      ref: x.ref,
      image: x.image,
      max: x.max,
      label: named(x.name, x.max),
    }));
  }, [goods.data, kind, en]);
  const picked = options.find((o) => o.ref === ref);
  const max = picked?.max ?? 1;
  // Ресурс за тот же ресурс не продаётся.
  const payWith = currencies.filter((c) => !(kind === "resource" && c === `res:${ref}`));

  const sell = useMutation({
    mutationFn: async () => {
      if (!picked) throw new Error(en ? "Pick an item" : "Выбери вещь");
      if (!currency) throw new Error(en ? "Pick a currency" : "Выбери валюту");
      const start = Number(price);
      if (!(start > 0))
        throw new Error(en ? "Start price above zero" : "Стартовая цена больше нуля");
      return createPlayerLot({
        data: {
          kind,
          ref: picked.ref,
          qty: countOrThrow(qty, max, (m) =>
            en
              ? `You only have ${m.toLocaleString("en-US")}`
              : `У тебя только ${m.toLocaleString("ru-RU")}`,
          ),
          currency,
          startPrice: start,
          duration,
          opId: crypto.randomUUID(),
        },
      });
    },
    onSuccess: () => {
      toast.success(en ? "Lot listed" : "Лот выставлен");
      refreshAuctionData(qc);
      onDone();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : String(e));
      refreshAuctionData(qc);
    },
  });

  return (
    <div className="auction-form auction-house__form">
      <Pills value={kind} options={["custom", "artifact", "resource"] as const}
        onPick={(k) => { setKind(k); setRef(""); setQty("1"); }} fmt={(k) => KIND[k][i]} />
      <div className="auction-sell__item-row">
        <div><label className="auction-label">{en ? "Item" : "Вещь"}</label>
          <PrizePicker options={options} value={ref} onChange={(v) => { setRef(v); setQty("1"); }}
            placeholder={en ? "— pick —" : "— выбери —"}
            empty={goods.isLoading ? "…" : en ? "Nothing to sell" : "Нечего выставить"} />
        </div>
        <CountField label={en ? "Quantity" : "Количество"} value={qty} onChange={setQty} max={max} />
      </div>
      {goods.isError && <p role="alert">{en ? "Could not load items" : "Не удалось загрузить вещи"}
        <button type="button" className="auction-secondary" onClick={() => goods.refetch()}>{en ? "Retry" : "Повторить"}</button></p>}
      <div className="auction-row2 auction-row2--nums">
        <div><label className="auction-label">{en ? "Start price" : "Стартовая цена"}</label>
          <input className="auction-field" type="number" min={0} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div><label className="auction-label">{en ? "Currency" : "Валюта"}</label>
          <select className="auction-field" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="">{en ? "— pick —" : "— выбери —"}</option>
            {payWith.map((c) => <option key={c} value={c}>{currencyLabel(c, en)}</option>)}
          </select>
        </div>
      </div>
      <div><label className="auction-label">{en ? "Auction duration" : "Длительность торгов"}</label>
        <Pills value={duration} options={PLAYER_DURATIONS} onPick={setDuration} fmt={(d) => DUR[d][i]} />
      </div>
      <div className="auction-sell__footer"><button type="button" className="auction-primary auction-house__submit"
        disabled={sell.isPending} onClick={() => sell.mutate()}>
        {sell.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {en ? "List" : "Выставить"}
      </button></div>
    </div>
  );
}
