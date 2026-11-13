// Ещё одна кнопка на плашке маршрута — дело лопаты в руках с этой клеткой
// (ПРАВИЛА §8.24): «Копать» / «Закопать» / «Выкопать». Вплотную — «… · 2⚡» и
// дело сразу (плашка закрывается); далеко — герой сразу идёт к соседней клетке
// и делает дело по приходу (с 12.11; дверь на пути — плашка «<дело> · N шагов»).
// Предложения по этой клетке нет — кнопки нет.
import { Shovel } from "lucide-react";
import { useT } from "@/lib/i18n";
import { DIG_ENERGY } from "@/lib/lootBag";
import { scaleEnergy } from "@/lib/raid/island/energy";
import { useEnergyMult } from "@/components/beta-raid/useEnergyMult";
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
  // На острове копать в 10 раз дешевле — та же цена, что спишет сервер (payDig).
  const need = scaleEnergy(DIG_ENERGY, useEnergyMult());
  if (!offer || offer.q !== at.q || offer.r !== at.r) return null;
  const label = t(SHOVEL_LABEL[offer.act]);
  const short = offer.near && energy < need;
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
      {offer.near ? `${label} · ${need}⚡` : label}
    </button>
  );
}
