// Ещё одна кнопка на плашке маршрута — дело вещи в руке с этой клеткой, как у лопаты
// (handTap «offer»): своя земля под перестройку — «Разместить · ⚡5», пустая земля под
// динамит — «Бросить · ⚡100». Герой при этом никуда не идёт: земля кладётся и динамит
// летит до 3 клеток от него. Тап по другой клетке — кнопка уходит.
import { useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n";
import { getHand, handAt, runHand, subscribeHand } from "./handStore";
import { handActLabel, handIcon } from "./handLabel";

export function HandSpotButton({
  at,
  onDone,
}: {
  at: { q: number; r: number };
  /** Дело пошло — плашку маршрута закрыть. */
  onDone?: () => void;
}) {
  const t = useT();
  const hand = useSyncExternalStore(subscribeHand, getHand, () => null);
  const spot = hand?.spot;
  if (!hand || !spot || spot.q !== at.q || spot.r !== at.r) return null;
  const c = handAt(at.q, at.r);
  if (!c?.ok) return null;
  const Icon = handIcon(hand.kind);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        runHand([at]);
        onDone?.();
      }}
      className="inline-flex items-center gap-1 rounded-lg border border-gold/60 bg-black/90 px-3 py-1.5 text-xs font-bold text-gold shadow-lg active:scale-95"
    >
      <Icon className="h-3.5 w-3.5" />
      {handActLabel(t, hand.kind, 1, c.cost)}
    </button>
  );
}
