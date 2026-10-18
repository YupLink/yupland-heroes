// Маркет глазами админа: привязка к ратуше и фильтр покупателей (на ВЕСЬ
// магазин, сверху), шаблоны витрин и список товаров с добавлением/правкой. Открывается в редакторе карт и
// в режиме бога на клетке-маркете.
//
// У клетки ДВЕ независимые витрины, между ними переключает тумблер:
//   «Покупка» — магазин продаёт: игрок платит цену, получает товар;
//   «Продажа» — магазин скупает: игрок отдаёт товар, получает цену.
// Настройки у сторон одинаковые, содержимое — разное.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Store, Users } from "lucide-react";
import { getMarketItems } from "@/server/api/beta-raid/market-admin";
import { getMarketShop, setMarketShop } from "@/server/api/beta-raid/market-shop";
import type { MarketItem, MarketSide } from "@/lib/marketItem";
import { MarketItemForm } from "./MarketItemForm";
import { MarketBuyerFilter } from "./MarketBuyerFilter";
import { MarketTemplateBar } from "./MarketTemplateBar";
import { MarketEditorRow } from "./MarketEditorRow";
import { MarketTownBind } from "./MarketTownBind";
import { MarketPawnMarkup } from "./MarketPawnMarkup";

function ShopFilter({ q, r }: { q: number; r: number }) {
  const qc = useQueryClient();
  const shopQ = useQuery({
    queryKey: ["market-shop", q, r],
    queryFn: () => getMarketShop({ data: { q, r } }),
    staleTime: 10_000,
  });
  const [races, setRaces] = useState<string[]>([]);
  const [specs, setSpecs] = useState<string[]>([]);
  // Держим последние значения в ref: раньше apply второго поля брал companion
  // из замыкания рендера и мог затереть только что сохранённую расу/спец.
  const racesRef = useRef<string[]>([]);
  const specsRef = useRef<string[]>([]);
  useEffect(() => {
    if (shopQ.data) {
      setRaces(shopQ.data.races);
      setSpecs(shopQ.data.specs);
      racesRef.current = shopQ.data.races;
      specsRef.current = shopQ.data.specs;
    }
  }, [shopQ.data]);

  const save = useMutation({
    mutationFn: (next: { races: string[]; specs: string[] }) =>
      setMarketShop({ data: { q, r, races: next.races, specs: next.specs } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["market-shop", q, r] }),
  });
  const applyRaces = (nr: string[]) => {
    racesRef.current = nr;
    setRaces(nr);
    save.mutate({ races: nr, specs: specsRef.current });
  };
  const applySpecs = (ns: string[]) => {
    specsRef.current = ns;
    setSpecs(ns);
    save.mutate({ races: racesRef.current, specs: ns });
  };

  return (
    <div className="rounded-lg border border-border bg-background/40 p-2">
      <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
        <Users className="h-3 w-3" /> Кто может торговать · весь магазин
      </div>
      <MarketBuyerFilter races={races} specs={specs} onRaces={applyRaces} onSpecs={applySpecs} />
    </div>
  );
}

/** Тумблер витрины: что сейчас настраиваем — покупку или скупку. */
function SideTabs({ side, onSide }: { side: MarketSide; onSide: (s: MarketSide) => void }) {
  const tab = (s: MarketSide, label: string, hint: string) => (
    <button
      key={s}
      type="button"
      onClick={() => onSide(s)}
      className={`rounded-lg px-2 py-1.5 text-center text-[11px] font-bold leading-tight transition ${
        side === s ? "bg-gold text-gold-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      <span className="block text-[9px] font-medium opacity-80">{hint}</span>
    </button>
  );
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-background/40 p-1">
      {tab("buy", "Покупка", "игрок платит цену")}
      {tab("sell", "Продажа", "игрок отдаёт товар")}
    </div>
  );
}

export function MarketEditor({ q, r }: { q: number; r: number }) {
  const [side, setSideRaw] = useState<MarketSide>("buy");
  const [open, setOpen] = useState<string | "new" | null>(null);
  const setSide = (s: MarketSide) => {
    setOpen(null); // форма чужой витрины закрывается вместе с переключением
    setSideRaw(s);
  };
  const itemsQ = useQuery({
    queryKey: ["market-items", q, r],
    queryFn: () => getMarketItems({ data: { q, r } }),
    staleTime: 10_000,
  });
  // Товары приходят обеими витринами разом — делим по стороне тут.
  const items = (itemsQ.data ?? []).filter((it: MarketItem) => it.side === side);
  // Ломбард: у лавки есть скупка «Любой … артефакт» — показываем наценку.
  const pawn = (itemsQ.data ?? []).some(
    (it: MarketItem) => it.side === "sell" && it.kind === "art" && /^art_any_/.test(it.refId ?? ""),
  );

  return (
    <div className="mb-3 space-y-2 rounded-xl border border-gold/30 bg-gold/5 p-2.5">
      <p className="flex items-center justify-center gap-1 text-center text-[11px] text-gold">
        <Store className="h-3 w-3" />
        Товары маркета · уходят сразу, «Сохранить» карты не нужно
      </p>

      <MarketTownBind q={q} r={r} />

      <ShopFilter q={q} r={r} />

      {pawn && <MarketPawnMarkup q={q} r={r} />}

      <SideTabs side={side} onSide={setSide} />

      <MarketTemplateBar q={q} r={r} />

      {itemsQ.isLoading ? (
        <p className="flex items-center justify-center gap-1.5 py-3 text-[11px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Загрузка…
        </p>
      ) : itemsQ.isError ? (
        <p className="py-3 text-center text-[11px] text-destructive">Не удалось загрузить товары</p>
      ) : items.length === 0 && open !== "new" ? (
        <p className="text-center text-[11px] text-muted-foreground">
          {side === "sell" ? "Скупать пока нечего" : "Товаров пока нет"}
        </p>
      ) : null}

      {items.map((it: MarketItem) => (
        <MarketEditorRow
          key={it.id}
          it={it}
          q={q}
          r={r}
          open={open === it.id}
          onToggle={() => setOpen(open === it.id ? null : it.id)}
          onSaved={() => setOpen(null)}
        />
      ))}

      {open === "new" ? (
        <MarketItemForm initial={null} side={side} q={q} r={r} onSaved={() => setOpen(null)} />
      ) : (
        <button
          type="button"
          onClick={() => setOpen("new")}
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 text-xs font-semibold text-muted-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          {side === "sell" ? "Добавить приём товара" : "Добавить товар"}
        </button>
      )}
    </div>
  );
}
