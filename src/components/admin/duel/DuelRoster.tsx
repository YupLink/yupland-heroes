// Выбор бойцов до боя каруселью (владелец 09.11.2026: «только иконки и карусель, чтобы
// выбрать, что хочу; цифры и данные не нужны — только жизни и урон, сокращая: 1к/1млн»;
// «можно расставить несколько одинаковых мобов»). Нажал иконку — ещё один такой в армии
// (до 4) и встал в зону; «−» — убрать одного. Имя — в подсказке.
// В песочнице — все мобы казарм; в настоящем бою будут только купленные.
import { useRef } from "react";
import { ChevronLeft, ChevronRight, Heart, Minus, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_MOBS } from "@/lib/duel/rules";
import type { DuelMob } from "@/server/api/duel/duel-api";
import { mobSrc } from "./canvas/images";
import type { DuelText } from "./duelText";

const arrow =
  "absolute top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/90 sm:flex";

export function DuelRoster({
  mobs,
  picked,
  onAdd,
  onRemove,
  t,
}: {
  mobs: DuelMob[];
  picked: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  t: DuelText;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const full = picked.length >= MAX_MOBS;
  const page = (dir: number) =>
    strip.current?.scrollBy({ left: dir * strip.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
      <p className="text-[12px] font-bold">
        {t.roster} · <span className="text-gold">{t.picked(picked.length, MAX_MOBS)}</span>
      </p>
      <div className="relative">
        <button
          type="button"
          aria-label="←"
          onClick={() => page(-1)}
          className={cn(arrow, "left-0")}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div
          ref={strip}
          className="flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth pb-1 pt-1 [scrollbar-width:none] sm:scroll-px-10 sm:px-10"
        >
          {mobs.map((m) => {
            const n = picked.filter((id) => id === m.id).length;
            return (
              <div key={m.id} className="relative w-[84px] shrink-0 snap-start">
                <button
                  type="button"
                  title={m.name}
                  aria-pressed={n > 0}
                  disabled={full}
                  onClick={() => onAdd(m.id)}
                  className={cn(
                    "w-full rounded-xl border p-1.5 text-center transition disabled:cursor-default",
                    n > 0
                      ? "border-gold bg-gold/15"
                      : "border-border bg-secondary/30 hover:bg-secondary/60",
                    full && n === 0 && "opacity-35",
                  )}
                >
                  <span className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-black/40">
                    {m.image && (
                      <img src={mobSrc(m.image)} alt="" className="h-full w-full object-contain" />
                    )}
                  </span>
                  <span className="mt-1 flex items-center justify-center gap-1 text-[11px] font-semibold tabular-nums">
                    <Heart className="h-3 w-3 text-red-400" />
                    {t.abbr(m.hp)}
                  </span>
                  <span className="flex items-center justify-center gap-1 text-[11px] font-semibold tabular-nums">
                    <Swords className="h-3 w-3 text-orange-400" />
                    {t.abbr(m.dmg[0])}
                    {m.dmg[1] > m.dmg[0] ? `–${t.abbr(m.dmg[1])}` : ""}
                  </span>
                </button>
                {n > 0 && (
                  <>
                    <span className="pointer-events-none absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[11px] font-bold text-gold-foreground">
                      ×{n}
                    </span>
                    <button
                      type="button"
                      aria-label="−"
                      onClick={() => onRemove(m.id)}
                      className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          aria-label="→"
          onClick={() => page(1)}
          className={cn(arrow, "right-0")}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
