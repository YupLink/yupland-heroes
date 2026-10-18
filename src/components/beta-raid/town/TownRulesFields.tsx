// Правила города (владелец, 03.10.2026): ровно два — наценка и НЗ. Ползунок
// тянется шагом 5 %, рядом поле — поставить своё число. Пределы те же, по
// которым прижимает сервер при сохранении (townRules.TOWN_RULE_BOUNDS).
// Пульт админский — по-русски.
import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { NumField } from "../market/NumField";
import { clampRule, TOWN_RULE_BOUNDS, TOWN_RULE_KEYS, type TownRules } from "@/lib/townRules";

const LABELS: Record<keyof TownRules, string> = {
  markupPct: "Наценка, когда город продаёт, %",
  reservePct: "НЗ — ниже город не продаёт, % нормы",
};

export function TownRulesFields({
  rules,
  onChange,
}: {
  rules: TownRules;
  onChange: (patch: Partial<TownRules>) => void;
}) {
  // Поле числа берёт значение на старте: двинули ползунок — пересоздаём его,
  // а набор своего числа поле не пересоздаёт (иначе «25» прижималось бы на «2»).
  const [moved, setMoved] = useState(0);
  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-background/40 p-2.5">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        Правила города
      </div>
      {TOWN_RULE_KEYS.map((k) => {
        const b = TOWN_RULE_BOUNDS[k];
        return (
          <div key={k}>
            <div className="mb-1.5 text-[11px] text-muted-foreground">
              {LABELS[k]} · {b.min}–{b.max}
            </div>
            <div className="flex items-center gap-3">
              <Slider
                min={b.min}
                max={b.max}
                step={b.step}
                value={[clampRule(k, rules[k])]}
                onValueChange={([v]) => {
                  onChange({ [k]: clampRule(k, v) });
                  setMoved((n) => n + 1);
                }}
                className="flex-1"
              />
              <NumField
                key={`${k}:${moved}`}
                value={rules[k]}
                onChange={(v) => onChange({ [k]: v ?? b.def })}
                className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-right text-sm tabular-nums"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
