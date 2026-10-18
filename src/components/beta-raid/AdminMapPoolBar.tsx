// Остаток игрового пула Darai — полоска над картой, видит только админ.
//
// Кошелёк дропа держит две разные кучи денег: выручку с билетов (её раздают
// холдерам) и взносы коллекции, из которых обеспечиваются награды на карте.
// Здесь показана вторая: сколько ещё можно разложить по сундукам и монеткам.
//
// Минус — не поломка и не запрет: карту разложили щедрее, чем пополнили
// коллекцию. Награды игрокам выдаются как обычно, красное число просто
// говорит, что пора досыпать.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { brushText } from "./adminBrushText";
import { getDaraiPools } from "@/server/api/darai-pools";
import { AdminPoolDetails } from "./AdminPoolDetails";

/** Кэш общий с любым другим местом, где спрашивают пул. */
export const DARAI_POOL_KEY = ["darai-map-pool"] as const;

export function AdminMapPoolBar() {
  const lang = useLang();
  const t = brushText(lang).pool;
  const fmt = (n: number) =>
    new Intl.NumberFormat(lang === "en" ? "en-US" : "ru-RU", {
      maximumFractionDigits: 0,
    }).format(n);

  const pools = useQuery({
    queryKey: DARAI_POOL_KEY,
    queryFn: () => getDaraiPools(),
    // Остаток кошелька читается из сети, поэтому не дёргаем его на каждый
    // возврат фокуса: цифра обновляется по правкам карты, а не сама собой.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const left = pools.data?.mapReserved ?? null;
  const short = left !== null && left < 0;
  const [open, setOpen] = useState(false);
  const d = pools.data;
  // «Роздано игрокам» не хранится отдельно: это ровно та часть обещаний,
  // которая больше не стоит на карте. Обещание либо ждёт игрока, либо уже
  // стало выплатой — третьего не дано.
  const paidOut = d ? Math.max(0, d.mapSpent - d.onMapNow) : 0;

  return (
    <div className="flex w-full flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-lg border border-border/60 bg-secondary/30 px-2 py-1 text-left"
      >
        <Coins className={cn("h-3.5 w-3.5", short ? "text-red-500" : "text-muted-foreground")} />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t.title}
        </span>
        {short && <span className="text-[10px] font-semibold text-red-500">{t.short}</span>}
        <span
          className={cn(
            "ml-auto text-[12px] font-bold tabular-nums",
            short ? "text-red-500" : "text-foreground",
          )}
        >
          {pools.isPending ? "…" : left === null ? t.failed : fmt(left)}
        </span>
      </button>
      {open && d && (
        <AdminPoolDetails
          lines={[
            { label: t.deposited, value: fmt(d.collectionDeposited) },
            { label: t.promised, value: fmt(d.mapSpent), muted: true },
            { label: t.onMap, value: fmt(d.onMapNow) },
            { label: t.paidOut, value: fmt(paidOut), muted: true },
          ]}
        />
      )}
    </div>
  );
}
