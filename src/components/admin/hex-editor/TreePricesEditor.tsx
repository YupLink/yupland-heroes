// Цены дерева уровней: за что игрок получит герою +1 уровень.
//
// Вариантов может быть несколько — игрок выберет любой. Пока список пуст,
// дерево не работает: игроку так и напишут «дерево ещё не настроено».
import { Plus, Trash2 } from "lucide-react";
import type { ServicePrice } from "@/lib/buildingEffect";

/** Больше сервер не примет: у него номер варианта ограничен. */
const MAX_PRICES = 20;

const KINDS: Array<{ value: ServicePrice["kind"]; label: string }> = [
  // Билетов нет (§8.61): цена «в билетах» платится золотом ×500.
  { value: "tickets", label: "Золото ×500 (цена в билетах)" },
  { value: "likes", label: "Лайки" },
  { value: "energy", label: "Энергия" },
  { value: "token", label: "Токен" },
];

export function TreePricesEditor({
  prices,
  tokens,
  onChange,
}: {
  prices: ServicePrice[];
  tokens: string[];
  onChange: (next: ServicePrice[]) => void;
}) {
  const patch = (i: number, p: Partial<ServicePrice>) =>
    onChange(prices.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <div className="mb-3 space-y-2 rounded-2xl border border-border bg-secondary/20 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Цена прокачки · +1 уровень герою
      </div>

      {prices.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Ни одной цены — игроки не смогут воспользоваться деревом.
        </p>
      )}

      {prices.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <select
            value={p.kind}
            onChange={(e) => patch(i, { kind: e.target.value as ServicePrice["kind"] })}
            className="rounded-xl border border-border bg-background px-2 py-2 text-sm"
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>

          {p.kind === "token" && (
            <select
              value={p.token ?? ""}
              onChange={(e) => patch(i, { token: e.target.value || null })}
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-2 py-2 text-sm"
            >
              <option value="">токен…</option>
              {tokens.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}

          <input
            type="number"
            min={1}
            step={1}
            value={p.amount || ""}
            onChange={(e) =>
              patch(i, { amount: Math.max(0, Math.round(Number(e.target.value) || 0)) })
            }
            placeholder="сколько"
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
          />

          <button
            type="button"
            onClick={() => onChange(prices.filter((_, j) => j !== i))}
            aria-label="Убрать цену"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      {prices.length < MAX_PRICES && (
        <button
          type="button"
          onClick={() => onChange([...prices, { kind: "tickets", token: null, amount: 0 }])}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-xs font-semibold text-muted-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Добавить вариант оплаты
        </button>
      )}
    </div>
  );
}
