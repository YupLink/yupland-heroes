// «Срубить руками» (владелец, 17.10.2026, §8.56) — вторая кнопка окна рубки:
// инструмента нет, а декор берёт деревянный или каменный топор — рубить без
// него за 10 энергии и 30 сытости героя. Цена — значками, как у окна: молния
// энергии, яблоко сытости (SatietyBar). Мало сытости или энергии — кнопка
// неактивна, причина строкой под ней; решает всё равно сервер.
//
// Отдельный элемент, а не часть окна: энергию и сытость читает только пока он
// на экране — окно без рубки руками лишних запросов не делает.
import { Apple, Hand, Loader2, Zap } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useEnergy } from "@/lib/hooks/useEnergy";
import { HAND_CHOP_ENERGY, HAND_CHOP_SATIETY, handChopBlock } from "@/lib/raid/handChop";
import { useSatiety } from "./SatietyBar";

export type DecorHandChopProps = {
  busy: boolean;
  onChop: () => void;
};

export function DecorHandChop({ busy, onChop }: DecorHandChopProps) {
  const t = useT();
  const energy = useEnergy().data?.energy;
  const satiety = useSatiety()?.now;
  const block = handChopBlock({ energy, satiety });
  const why =
    block === "satiety"
      ? t("braid.decor_hand_low_satiety", { n: HAND_CHOP_SATIETY })
      : block === "energy"
        ? t("braid.decor_hand_low_energy", { n: HAND_CHOP_ENERGY })
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
          <Zap className="h-4 w-4" />−{HAND_CHOP_ENERGY}
        </span>
        <span className="flex items-center gap-0.5 tabular-nums">
          <Apple className="h-4 w-4" />−{HAND_CHOP_SATIETY}
        </span>
      </button>
      {why && <p className="mt-1.5 text-center text-xs text-muted-foreground">{why}</p>}
    </>
  );
}
