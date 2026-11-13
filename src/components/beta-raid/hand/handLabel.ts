// Надпись и значок дела вещи в руке — для полосы руки (HandBar) и кнопки на плашке
// маршрута (HandSpotButton).
import { Bomb, Gem, Layers, Sprout, type LucideIcon } from "lucide-react";
import type { useT } from "@/lib/i18n";
import type { Hand } from "./handStore";

/** Значок дела: динамит — бомба, жила — камень, гриб — росток, земля — пласты. */
export const handIcon = (kind: Hand["kind"]): LucideIcon =>
  kind === "dynamite" ? Bomb : kind === "vein" ? Gem : kind === "mushroom" ? Sprout : Layers;

/** Надпись дела: сколько клеток и сколько энергии. */
export function handActLabel(
  t: ReturnType<typeof useT>,
  kind: Hand["kind"],
  n: number,
  energy: number,
): string {
  if (kind === "dynamite")
    return n > 1
      ? t("dynamite.throw_many", { k: n, n: energy })
      : t("dynamite.throw_cost", { n: energy });
  // Земля, жила и гриб — «Разместить ×N»; энергия — перестройка земли и посадка гриба.
  const base = n > 1 ? t("land.place_n", { n }) : t("land.place");
  return energy > 0 ? `${base} · ⚡${energy}` : base;
}
