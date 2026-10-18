// Бусты своего товара: какие характеристики героя качает и на сколько.
//
// Выключенный переключатель означает «обычный товар»: настройка не пишется, и
// покупатель нигде не читает про бусты. Внутри — тот же список эффектов, что у
// алтаря на клетке: несколько прибавок, диапазоны одним полем.
//
// Сытость (еда, §8.44) — отдельным полем над бустами: сколько прибавит к шкале
// героя одна штука. Хранится тем же эффектом «Сытость» (lib/hero/boostSatiety).
import { Apple, Dumbbell } from "lucide-react";
import { BOOST_STAT_KEYS, emptyBoostEffect, type BoostEffect } from "@/lib/hero/boost";
import { otherBoosts, satietyValueOf, withSatiety } from "@/lib/hero/boostSatiety";
import { BoostEffectsEditor } from "./BoostEffectsEditor";

export function CustomBoostFields({
  boost,
  onChange,
}: {
  boost: BoostEffect[] | null;
  onChange: (next: BoostEffect[] | null) => void;
}) {
  const satiety = satietyValueOf(boost);
  const others = otherBoosts(boost);
  const on = others.length > 0;

  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-secondary/20 p-2">
      <label className="flex items-center gap-2 text-xs font-semibold">
        <Apple className="h-3.5 w-3.5 text-gold" />
        <span className="flex-1">Сытость</span>
        <input
          value={satiety}
          onChange={(e) => onChange(withSatiety(others, e.target.value))}
          placeholder="0"
          inputMode="numeric"
          aria-label="Сытость за одну штуку"
          className="h-8 w-24 rounded-md border border-border bg-background px-2 text-right text-xs tabular-nums"
        />
      </label>

      <label className="flex items-center gap-2 text-xs font-semibold">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) =>
            onChange(withSatiety(e.target.checked ? [emptyBoostEffect()] : [], satiety))
          }
          className="h-4 w-4 accent-[var(--gold)]"
        />
        <Dumbbell className="h-3.5 w-3.5 text-gold" />
        Товар-БУСТ: даёт герою + к характеристикам
      </label>

      {on && (
        <div>
          <BoostEffectsEditor
            effects={others}
            stats={BOOST_STAT_KEYS.filter((k) => k !== "satiety")}
            onChange={(next) => onChange(withSatiety(otherBoosts(next), satiety))}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Игрок получает прибавки, использовав товар из рюкзака.
          </p>
        </div>
      )}
    </div>
  );
}
