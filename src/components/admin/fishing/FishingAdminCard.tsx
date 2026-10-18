// Админка рейда: «Рыбалка» (ПРАВИЛА §8.35) — интервал между попытками (минуты,
// по умолчанию 1), шанс рыбы на попытку (%, по умолчанию 10: владелец 05.10 —
// «1 минута — шанс 10 % на рыбу») и улов — свои товары списком.
// Настройка мира, одна на всю карту, — поэтому рядом с ценами смены героя.
// Удочку админ отмечает галочкой «Удочка» у своего товара и выставляет в лавки
// как любой свой товар.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fish, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import {
  FISH_CHANCE_DEFAULT,
  FISH_CHANCE_MAX,
  FISH_CHANCE_MIN,
  FISH_INTERVAL_DEFAULT,
  FISH_INTERVAL_MAX,
  FISH_INTERVAL_MIN,
} from "@/lib/raid/fishing";
import { withFishItem, withoutFishItem, type FishItem } from "@/lib/raid/fishChances";
import { getFishingAdmin, saveFishingAdmin } from "@/server/api/beta-raid/fishing/fishing-config";
import { FishingCatchGrid } from "@/components/admin/fishing/FishingCatchGrid";
import { FishChances } from "@/components/admin/fishing/FishChances";
import { listCustomItems } from "@/server/api/beta-raid/market-custom";

const KEY = ["admin-fishing"] as const;

export function FishingAdminCard() {
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: KEY, queryFn: () => getFishingAdmin() });
  type Draft = { interval: string; chance: string; items: FishItem[] };
  const [draft, setDraft] = useState<Draft | null>(null);
  const interval = draft?.interval ?? String(cfg.data?.intervalMin ?? FISH_INTERVAL_DEFAULT);
  const chance = draft?.chance ?? String(cfg.data?.chancePct ?? FISH_CHANCE_DEFAULT);
  const items: FishItem[] = draft?.items ?? cfg.data?.items ?? [];
  // Справочник своих товаров: имена и картинки видов в списке долей.
  const all = useQuery({
    queryKey: ["custom-items"],
    queryFn: () => listCustomItems(),
    staleTime: 60_000,
  });
  const minutes = Math.round(Number(interval));
  const pct = Math.round(Number(chance));
  const valid =
    interval.trim() !== "" &&
    minutes >= FISH_INTERVAL_MIN &&
    minutes <= FISH_INTERVAL_MAX &&
    chance.trim() !== "" &&
    pct >= FISH_CHANCE_MIN &&
    pct <= FISH_CHANCE_MAX;
  const edit = (patch: Partial<Draft>) => setDraft({ interval, chance, items, ...patch });
  // Вид добавили — ему равная доля, остальные ужались; убрали — его доля
  // разошлась остальным. Сумма остаётся сотней без ручного пересчёта.
  const toggle = (id: string) =>
    edit({
      items: items.some((it) => it.id === id)
        ? withoutFishItem(items, id)
        : withFishItem(items, id),
    });

  const save = useMutation({
    mutationFn: () => saveFishingAdmin({ data: { intervalMin: minutes, chancePct: pct, items } }),
    onSuccess: (res) => {
      toast.success(
        `Рыбалка: раз в ${res.intervalMin} мин, шанс ${res.chancePct} %, видов — ${res.items.length}`,
      );
      setDraft(null);
      qc.setQueryData(KEY, res);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Fish className="h-3.5 w-3.5" />
        Рыбалка
      </div>
      <div className="space-y-3">
        <label className="flex items-center gap-2">
          <span className="w-40 text-xs text-muted-foreground">Интервал, мин</span>
          <input
            inputMode="numeric"
            value={interval}
            onChange={(e) => edit({ interval: e.target.value.replace(/[^\d]/g, "").slice(0, 5) })}
            placeholder={String(FISH_INTERVAL_DEFAULT)}
            className="w-28 rounded-xl border border-border bg-background px-3 py-2 text-base"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="w-40 text-xs text-muted-foreground">Шанс рыбы, %</span>
          <input
            inputMode="numeric"
            value={chance}
            onChange={(e) => edit({ chance: e.target.value.replace(/[^\d]/g, "").slice(0, 3) })}
            placeholder={String(FISH_CHANCE_DEFAULT)}
            className="w-28 rounded-xl border border-border bg-background px-3 py-2 text-base"
          />
        </label>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Улов</div>
          <FishingCatchGrid picked={items.map((it) => it.id)} onToggle={toggle} />
        </div>
        {items.length > 0 && (
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Шансы видов</div>
            <FishChances
              items={items}
              all={all.data ?? []}
              onChange={(next) => edit({ items: next })}
            />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => valid && save.mutate()}
        disabled={!valid || save.isPending || cfg.isLoading}
        className="mt-3 flex items-center gap-1.5 rounded-xl gradient-gold px-4 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"
      >
        {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Сохранить
      </button>
    </div>
  );
}
