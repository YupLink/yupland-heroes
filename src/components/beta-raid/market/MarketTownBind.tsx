// Привязка лавки к ратуше (владелец, 04.10.2026): галочка и выбор ратуши —
// от ближней к дальней. С галочкой лавка торгует своими позициями, которые есть
// в ратуше, по её складу и цене; без неё — ровно тем, что в самой лавке.
//
// Список — кнопками, не нативным <select>: в вебвью Xiaomi нативный выбор не
// срабатывает (то же решение, что в редакторе наград).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getShopTownBinding,
  setShopTownBinding,
  type ShopTownBinding,
  type TownHallOption,
} from "@/server/api/beta-raid/town-binding";
import { humanError } from "@/lib/humanError";

// Ратушу узнают по названию города; безымянную — по местности под ней.
const hallLabel = (h: TownHallOption) =>
  `${h.title ?? h.land ?? h.name} · ${h.q},${h.r} · ${h.dist} кл. · ${h.residents} жит.`;

type Town = { q: number; r: number } | null;

export function MarketTownBind({ q, r }: { q: number; r: number }) {
  const qc = useQueryClient();
  const key = ["shop-town", q, r];
  const bindQ = useQuery({
    queryKey: key,
    queryFn: () => getShopTownBinding({ data: { q, r } }),
    staleTime: 10_000,
  });
  const [open, setOpen] = useState(false);
  const save = useMutation({
    mutationFn: (town: Town) => setShopTownBinding({ data: { q, r, town } }),
    // Галочка и выбор отзываются сразу, не дожидаясь ответа сервера.
    onMutate: (town: Town) => {
      const prev = qc.getQueryData<ShopTownBinding>(key);
      if (prev) qc.setQueryData<ShopTownBinding>(key, { ...prev, town });
      return { prev };
    },
    onError: (e: Error, _t, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(humanError(e));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      // Витрина лавки меняется целиком: цены и позиции теперь чьи-то другие.
      qc.invalidateQueries({ queryKey: ["beta-raid-building"] });
    },
  });

  const halls = bindQ.data?.halls ?? [];
  const town = bindQ.data?.town ?? null;
  const current = town ? halls.find((h) => h.q === town.q && h.r === town.r) : undefined;
  const pick = (h: TownHallOption) => {
    setOpen(false);
    save.mutate({ q: h.q, r: h.r });
  };
  // Включили галочку — сразу ближайшая ратуша: пустой привязки не бывает.
  const toggle = () => {
    if (town) save.mutate(null);
    else if (halls[0]) save.mutate({ q: halls[0].q, r: halls[0].r });
  };

  return (
    <div className="rounded-lg border border-border bg-background/40 p-2">
      <button
        type="button"
        onClick={toggle}
        disabled={bindQ.isLoading || (!town && halls.length === 0)}
        className="flex w-full items-center gap-2 text-left text-[11px] font-semibold disabled:opacity-50"
      >
        <span
          className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
            town ? "border-gold bg-gold text-gold-foreground" : "border-border"
          }`}
        >
          {town && <Check className="h-3 w-3" />}
        </span>
        <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
        Привязать к ратуше
        {(bindQ.isLoading || save.isPending) && (
          <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </button>
      {!bindQ.isLoading && halls.length === 0 && (
        <p className="mt-1 text-[10px] text-muted-foreground">Ратуш на карте нет</p>
      )}
      {town && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center gap-1 rounded-lg border border-gold/40 bg-background px-2 py-1.5 text-left text-[11px]"
          >
            <span className="min-w-0 flex-1 truncate">
              {current ? hallLabel(current) : `Ратуша ${town.q},${town.r}`}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
          {open && (
            <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-background">
              {halls.map((h) => {
                const on = h.q === town.q && h.r === town.r;
                return (
                  <button
                    key={`${h.q},${h.r}`}
                    type="button"
                    onClick={() => pick(h)}
                    className={`block w-full truncate px-2 py-1.5 text-left text-[11px] ${
                      on ? "bg-gold/15 text-gold" : "text-foreground"
                    }`}
                  >
                    {hallLabel(h)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
