// Ещё одна кнопка на плашке маршрута — дело лопаты в руках с этой клеткой
// (ПРАВИЛА §8.24): «Копать» / «Закопать» / «Выкопать». Вплотную — «… · 2⚡» и
// дело сразу (плашка закрывается); далеко — маршрут «<дело> · N шагов ⚡X» к
// соседней клетке вместо прежнего. Предложения по этой клетке нет — кнопки нет.
import { Shovel } from "lucide-react";
import { useT } from "@/lib/i18n";
import { DIG_ENERGY } from "@/lib/lootBag";
import { SHOVEL_LABEL, shovelOffer, useShovelOffer } from "@/components/beta-raid/tool/shovelOffer";

export function ShovelBadgeButton({
  at,
  energy,
  onDone,
}: {
  /** Клетка дела плашки (цель маршрута «дойти и …», а не соседняя). */
  at: { q: number; r: number };
  energy: number;
  /** Сделано на месте — закрыть плашку маршрута. */
  onDone?: () => void;
}) {
  const t = useT();
  const offer = useShovelOffer();
  if (!offer || offer.q !== at.q || offer.r !== at.r) return null;
  const label = t(SHOVEL_LABEL[offer.act]);
  const short = offer.near && energy < DIG_ENERGY;
  return (
    <button
      type="button"
      disabled={short}
      onClick={(e) => {
        e.stopPropagation();
        if (shovelOffer.go()) onDone?.();
      }}
      className="inline-flex items-center gap-1 rounded-lg border border-gold/60 bg-black/90 px-3 py-1.5 text-xs font-bold text-gold shadow-lg active:scale-95 disabled:opacity-50"
    >
      <Shovel className="h-3.5 w-3.5" />
      {offer.near ? `${label} · ${DIG_ENERGY}⚡` : label}
    </button>
  );
}
