// «Срубить руками» (владелец, 17.10.2026, §8.56) — вторая кнопка окна рубки:
// декор берёт деревянный или каменный топор — рубить без него (с 29.10 — и
// когда топор есть) за энергию ×2 и 30 сытости героя. Цена — значками, как у окна: молния
// энергии, яблоко сытости (SatietyBar). Мало сытости или энергии — кнопка
// неактивна, причина строкой под ней; решает всё равно сервер.
//
// Отдельный элемент, а не часть окна: энергию и сытость читает только пока он
// на экране — окно без рубки руками лишних запросов не делает.
import { Apple, Hand, Loader2, Zap } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useEnergy } from "@/lib/hooks/useEnergy";
import { HAND_CHOP_SATIETY, handChopBlock } from "@/lib/raid/handChop";
import { scaleSatiety } from "@/lib/raid/island/satiety";
import { useSatiety } from "./SatietyBar";
import { useSatietyMult } from "./useEnergyMult";
import { ChopWalkCost } from "./ChopWalkCost";

export type DecorHandChopProps = {
  busy: boolean;
  onChop: () => void;
  /** Цена энергией на карте игрока: на острове в 10 раз (useDecorInteract). */
  /** Цена энергией руками на этой карте (handChopEnergy × множитель карты). */
  cost: number;
  /** Энергия на дорогу к дереву (окно открыто издалека); 0 / null — не пишем. */
  walk?: number | null;
};

export function DecorHandChop({ busy, onChop, cost, walk }: DecorHandChopProps) {
  const t = useT();
  const energy = useEnergy().data?.energy;
  const satiety = useSatiety()?.now;
  // На острове сытость тратится в 10 раз меньше (island/satiety).
  const satNeed = scaleSatiety(HAND_CHOP_SATIETY, useSatietyMult());
  const block = handChopBlock({ energy, satiety, need: cost, satNeed });
  const why =
    block === "satiety"
      ? t("braid.decor_hand_low_satiety", { n: satNeed })
      : block === "energy"
        ? t("braid.decor_hand_low_energy", { n: cost })
        : null;
  return (
    <>
      <button
        type="button"
        onClick={onChop}
        disabled={busy || block !== null}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-gold/50 px-4 py-3 text-sm font-bold text-gold disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hand className="h-4 w-4" />}
        {t("braid.decor_hand")}
        <span className="ml-1 flex items-center gap-0.5 tabular-nums">
          <Zap className="h-4 w-4" />−{cost}
        </span>
        <span className="flex items-center gap-0.5 tabular-nums">
          <Apple className="h-4 w-4" />−{satNeed}
        </span>
        <ChopWalkCost cost={walk} />
      </button>
      {why && <p className="mt-1.5 text-center text-xs text-muted-foreground">{why}</p>}
    </>
  );
}
