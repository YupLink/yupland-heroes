// Нижняя панель боя (владелец 09.11.2026: «вот пример, как может выглядеть
// сражение — давай сделаем что-то подобное»): слева крупно — кто ходит, его жизни
// полосой и что он умеет; справа — очередь следующих с жизнями и последний ход.
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DuelState, Unit } from "@/lib/duel/types";
import { DuelQueue, UnitFace } from "./DuelQueue";
import { short, type DuelText } from "./duelText";

function Portrait({ u }: { u: Unit }) {
  const pct = Math.round((100 * u.hp) / Math.max(1, u.maxHp));
  return (
    <div className="w-16 shrink-0">
      <div
        className={cn(
          "relative h-16 w-16 overflow-hidden rounded-xl border-2 bg-black/60",
          u.side === "a" ? "border-blue-500" : "border-red-500",
        )}
      >
        <UnitFace u={u} big />
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn("h-full", u.side === "a" ? "bg-blue-500" : "bg-red-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function DuelHud({ st, unit, t }: { st: DuelState; unit: Unit | null; t: DuelText }) {
  const last = st.log[st.log.length - 1];
  return (
    <div className="flex gap-2.5">
      {unit && <Portrait u={unit} />}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[13px] font-bold">
            {unit ? (
              <>
                <span className={unit.side === "a" ? "text-blue-400" : "text-red-400"}>
                  {t.sideName(unit.side)}:
                </span>{" "}
                {unit.name}
                <span className="ml-1.5 text-[11px] font-normal tabular-nums text-muted-foreground">
                  {short(unit.hp)} / {short(unit.maxHp)} · {t.steps(unit.move)} ·{" "}
                  {unit.range >= 2 ? t.ranged(unit.range) : t.melee}
                </span>
              </>
            ) : (
              t.round(st.round)
            )}
          </p>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary/50 px-2 py-0.5 text-[12px] font-semibold tabular-nums">
            <Zap className="h-3.5 w-3.5 text-gold" />
            {st.kits.a.energy}
          </span>
        </div>
        <DuelQueue st={st} />
        {last && (
          <p className="truncate rounded-md bg-black/40 px-2 py-1 font-mono text-[11px] text-white/85">
            {t.log(last)}
          </p>
        )}
      </div>
    </div>
  );
}
