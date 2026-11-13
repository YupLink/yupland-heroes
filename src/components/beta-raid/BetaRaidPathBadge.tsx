// Метка выбранного маршрута: сколько шагов, сколько энергии и кнопка «Идти».
// Висит над целевой клеткой и уезжает вместе с картой.
//
// Позицию метке выставляет кадр карты (useMapRenderer.placeBadge) прямо в
// style.transform: считать её в React значило бы ререндер на каждый кадр камеры.
//
// Лопата в руках (§8.24) — ещё одна кнопка: дело лопаты с клеткой цели
// (ShovelBadgeButton); «копать под собой» — плашка из одной этой кнопки. Вещь в руке
// (земля, динамит) — кнопка её дела с этой клеткой (HandSpotButton).
import { useEffect } from "react";
import { Zap } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { formatEnergyCost } from "@/lib/shipRules";
import type { PortalPrice } from "@/lib/portal";
import { plural } from "./effectMeta";
import { PathTollLine } from "./PathTollLine";
import { usePlayerFunds } from "./market/usePlayerFunds";
import { priceRow, priceShort } from "./portalPriceText";
import { ShovelBadgeButton } from "./tool/ShovelBadgeButton";
import { shovelOffer } from "./tool/shovelOffer";
import { HandSpotButton } from "./hand/HandSpotButton";
import { setSpot } from "./hand/handStore";

export function BetaRaidPathBadge({
  hostRef,
  target,
  energy,
  onConfirm,
  onCancel,
}: {
  hostRef: React.RefObject<HTMLDivElement | null>;
  target: {
    q: number;
    r: number;
    /** Полный счёт: дорога плюс действие в конце. */
    cost: number;
    /** Только дорога — по ней и решаем, отпускать ли героя. */
    walkCost: number;
    steps: number;
    actionLabel?: string | null;
    /**
     * Плата за ворота на пути (без энергии — та уже в cost). Кнопку по ней не
     * гасим: списывает шаг в дверь, и отказать вправе только сервер; плашка
     * лишь показывает, что спишется, и красит нехватку.
     */
    toll?: PortalPrice[];
    /** Клетка дела и что за дело (маршрут «дойти и …»); here — копать под собой. */
    at?: { q: number; r: number };
    kind?: string | null;
    here?: boolean;
    /** Сколько первых шагов оплачено энергией (pathReach). */
    reach: number;
  };
  /** Сколько энергии есть сейчас — дальше кошелька маршрут не пускаем. */
  energy: number;
  /** reach — идти только первые N шагов: на весь путь энергии нет. */
  onConfirm?: (reach: number | null) => void;
  onCancel?: () => void;
}) {
  const t = useT();
  const lang = useLang();
  // Дорога дороже, чем есть энергии, — идти нечем. Раньше кнопка про энергию
  // не знала вовсе: игрок жал «Идти», проходил половину пути и ловил отказ
  // сервера с откатом — со стороны это выглядело как «съело энергию ни за что».
  // Особенно легко под замедлением, где каждый шаг дороже.
  // Хватает ли на весь путь — тем же счётом, что красит стрелки (pathReach, с
  // запасом на хвост дроби): 9 × 0.92 при 8.28 энергии — все зелёные, кнопка тоже.
  const canWalk = target.reach >= target.steps;
  // На весь путь не хватает, но на часть — хватает: «Идти» ведёт до последней
  // зелёной стрелки (владелец, 25.10.2026, как в «Героях 3»), дело в конце не
  // делаем — герой до цели не дойдёт.
  const partial = !canWalk && target.reach > 0 && target.reach < target.steps;
  // На полный счёт (дорога + действие) может и не хватать — тогда идти можно,
  // но цену показываем тревожным цветом, чтобы это не стало сюрпризом на месте.
  const canFinish = energy >= target.cost;
  // Ресурс двери, которого заведомо не хватает (счёт известен и меньше цены):
  // идти нечем — у самой двери сервер откажет, а шаги до неё уже сгорят.
  // null/Infinity (счёт не приехал, товар в рюкзаке) — не гасим.
  const have = usePlayerFunds();
  const shortToll = (target.toll ?? []).find((p) => priceShort(p, have));
  const canGo = (canWalk || partial) && !shortToll;
  // «Копать под собой» сменил прежний маршрут — тот снимаем, чтобы не висел на карте.
  const here = !!target.here;
  useEffect(() => {
    if (here) onCancel?.();
  }, [here, onCancel]);
  // Маршрут уже с делом лопаты — вторая кнопка та же, её не дублируем.
  const shovel =
    target.at && target.kind !== "dig" ? (
      <ShovelBadgeButton at={target.at} energy={energy} onDone={onCancel} />
    ) : null;
  const cancel = (
    <button
      onClick={(e) => {
        e.stopPropagation();
        shovelOffer.set(null);
        setSpot(null);
        onCancel?.();
      }}
      className="text-[10px] text-muted-foreground hover:text-foreground"
    >
      {t("braid.cancel")}
    </button>
  );
  const host = "pointer-events-auto absolute left-0 top-0 z-10 flex flex-col items-center gap-1";
  if (here) {
    return (
      <div ref={hostRef} className={host} style={{ visibility: "hidden" }} data-path-badge>
        {shovel}
        {cancel}
      </div>
    );
  }
  return (
    <div ref={hostRef} className={host} style={{ visibility: "hidden" }} data-path-badge>
      <div className="inline-flex items-center gap-1.5 rounded-lg bg-black/90 px-3 py-1.5 text-xs text-white shadow-lg">
        {target.actionLabel ? `${target.actionLabel} · ` : ""}
        {plural(t, lang, "braid.pl_step", target.steps)}
        <span
          className={`inline-flex items-center gap-0.5 ${canFinish ? "text-gold" : "text-destructive"}`}
        >
          <Zap className="h-3 w-3" />
          {formatEnergyCost(target.cost)}
        </span>
        {target.toll && target.toll.length > 0 && <PathTollLine toll={target.toll} />}
      </div>
      <button
        type="button"
        disabled={!canGo}
        onClick={(e) => {
          e.stopPropagation();
          onConfirm?.(canWalk ? null : target.reach);
        }}
        className={
          canGo
            ? "rounded-lg gradient-gold px-4 py-1.5 text-xs font-bold text-gold-foreground shadow-lg active:scale-95"
            : "rounded-lg border border-border bg-black/85 px-4 py-1.5 text-xs font-semibold text-muted-foreground shadow-lg"
        }
      >
        {canGo
          ? canWalk
            ? (target.actionLabel ?? t("braid.go_walk"))
            : t("braid.go_walk")
          : shortToll
            ? t("braid.need_toll", { price: priceRow(shortToll, t).label })
            : t("braid.need_energy", { n: formatEnergyCost(target.walkCost) })}
      </button>
      {shovel}
      {target.at && <HandSpotButton at={target.at} onDone={onCancel} />}
      {cancel}
    </div>
  );
}
