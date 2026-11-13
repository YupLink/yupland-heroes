// Очередь ходов в нижней панели: кто ходит следом за текущим (он — крупно слева,
// DuelHud) и сколько у каждого жизней. Рамка — цвет стороны: синие — ваши,
// красные — противника (владелец 09.11.2026: «вот пример, как может выглядеть сражение»).
import { cn } from "@/lib/utils";
import { unitById } from "@/lib/duel/options";
import type { DuelState, Unit } from "@/lib/duel/types";
import { mobSrc } from "./canvas/images";
import { short } from "./duelText";

const SHOWN = 9;

/** Лицо бойца: у героя — кадр стойки из атласа бега (1024×384, кадр 128, столбец 1, ряд 2). */
export function UnitFace({ u, big }: { u: Unit; big?: boolean }) {
  if (u.atlas) {
    return (
      <img
        src={u.atlas}
        alt=""
        className={cn(
          "absolute max-w-none",
          // ×0,5 → 64 px; ×0,28125 → 36 px.
          big
            ? "left-[-64px] top-[-128px] h-[192px] w-[512px]"
            : "left-[-36px] top-[-72px] h-[108px] w-[288px]",
        )}
      />
    );
  }
  return u.image ? (
    <img src={mobSrc(u.image)} alt="" className="h-full w-full object-contain" />
  ) : null;
}

export function DuelQueue({ st }: { st: DuelState }) {
  const order = [...st.order.slice(st.turn), ...st.order.slice(0, st.turn)]
    .map((id) => unitById(st, id))
    .filter((u): u is Unit => !!u && u.hp > 0)
    .slice(1, SHOWN + 1);
  return (
    <div className="flex gap-1.5 overflow-hidden">
      {order.map((u) => (
        <div key={u.id} title={u.name} className="w-9 shrink-0 text-center">
          <div
            className={cn(
              "relative h-9 w-9 overflow-hidden rounded-lg border-2 bg-black/60",
              u.side === "a" ? "border-blue-500" : "border-red-500",
            )}
          >
            <UnitFace u={u} />
          </div>
          <span className="block text-[9.5px] font-semibold tabular-nums text-muted-foreground">
            {short(u.hp)}
          </span>
        </div>
      ))}
    </div>
  );
}
