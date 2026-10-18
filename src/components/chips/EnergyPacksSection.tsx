import { useQuery } from "@tanstack/react-query";
import { Zap } from "lucide-react";
import { listEnergyPacksPublic } from "@/server/api/energyPacks";
import { EnergyPackCard } from "./EnergyPackCard";
import { EnergyPendingBanner } from "./EnergyPendingBanner";

export function EnergyPacksSection({
  availableTickets,
  availableDarai,
}: {
  availableTickets: number;
  availableDarai: number;
}) {
  const q = useQuery({
    queryKey: ["energy-packs-public"],
    queryFn: () => listEnergyPacksPublic(),
  });
  const data = q.data;
  if (!data || data.packs.length === 0) return null;
  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Zap className="h-3.5 w-3.5 text-rose-400" /> Энергия
        {!data.enabled && (
          <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
            видно только тебе (тест)
          </span>
        )}
        <span className="h-px flex-1 bg-border/50" />
      </div>
      <EnergyPendingBanner />
      {/* Одинаковое количество энергии сводим к одному предложению: показываем
          пак, где покупки ещё остались (иначе первый по порядку). */}
      {Array.from(
        data.packs
          .reduce((m, p) => {
            const cur = m.get(p.amount);
            const alive = (x: typeof p) =>
              x.offers ? x.offers.some((o) => o.price != null) : true;
            if (!cur || (!alive(cur) && alive(p))) m.set(p.amount, p);
            return m;
          }, new Map<number, (typeof data.packs)[number]>())
          .values(),
      ).map((p) => (
        <EnergyPackCard
          key={p.id}
          pack={p}
          availableTickets={availableTickets}
          availableDarai={availableDarai}
        />
      ))}
    </div>
  );
}
