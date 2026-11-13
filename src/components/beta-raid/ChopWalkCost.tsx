// Дорога в кнопке рубки (владелец, 13.11.2026): сколько энергии уйдёт, чтобы
// подойти к дереву, — «дорога» плашки маршрута (walkEnergy). Рядом или пути нет
// (cost 0 / null) — ничего не пишем.
import { Footprints, Zap } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatEnergyCost } from "@/lib/shipRules";

export function ChopWalkCost({ cost }: { cost?: number | null }) {
  const t = useT();
  if (cost == null || !(cost > 0)) return null;
  const n = formatEnergyCost(cost);
  const label = t("braid.decor_walk", { n });
  return (
    <span className="ml-1 flex items-center gap-0.5 tabular-nums" aria-label={label} title={label}>
      <Footprints className="h-4 w-4" />
      <Zap className="h-4 w-4" />−{n}
    </span>
  );
}
