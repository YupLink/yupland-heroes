// Лестница цен одной строкой: ступени «цена × раз в день» идут вбок, в конце
// «+ шаг». Общая для энергопаков (строка на валюту) и «энергии за лайки».
// scale — цена в поле = хранимая × scale (золото энергопака: в базе билеты, ×500).
import type { ReactNode } from "react";
import { Plus, X } from "lucide-react";
import type { CurrencyStep } from "@/lib/energySteps";

export function StepLadderRow({
  steps,
  onChange,
  scale = 1,
  priceLabel = "цена",
}: {
  steps: CurrencyStep[];
  onChange: (next: CurrencyStep[]) => void;
  scale?: number;
  priceLabel?: ReactNode;
}) {
  const patch = (j: number, p: Partial<CurrencyStep>) =>
    onChange(steps.map((x, k) => (k === j ? { ...x, ...p } : x)));
  // Хвост деления (2.468 × 500 = 1234.0000000000002) в поле не показываем.
  const shown = (amount: number) => (scale === 1 ? amount : Math.round(amount * scale * 1e4) / 1e4);

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {steps.map((st, j) => (
        <div
          key={j}
          className="w-[150px] shrink-0 rounded-lg border border-border bg-background/60 p-1.5"
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-bold text-gold">шаг {j + 1}</span>
            {steps.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(steps.filter((_, k) => k !== j))}
                className="rounded p-0.5 text-muted-foreground hover:text-rose-400"
                title="Убрать шаг"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <label className="mb-1 flex items-center gap-1 text-[9px] uppercase text-muted-foreground">
            {priceLabel}
          </label>
          <input
            type="number"
            min={0}
            step="any"
            value={shown(st.amount)}
            onChange={(e) => patch(j, { amount: (Number(e.target.value) || 0) / scale })}
            className="w-full rounded-md border border-border bg-background px-1.5 py-1 text-[11px] tabular-nums"
          />
          <label className="mb-1 mt-1 block text-[9px] uppercase text-muted-foreground">
            раз в день
          </label>
          <input
            type="number"
            min={1}
            value={st.times}
            onChange={(e) => patch(j, { times: Math.max(1, Number(e.target.value) || 1) })}
            className="w-full rounded-md border border-border bg-background px-1.5 py-1 text-[11px] tabular-nums"
          />
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          onChange([...steps, { amount: (steps.at(-1)?.amount ?? 100) * 2, times: 1 }])
        }
        className="flex w-[86px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border text-[10px] text-muted-foreground transition hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        шаг
      </button>
    </div>
  );
}
