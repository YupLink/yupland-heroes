import { Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ABILITY_KINDS,
  ABILITY_META,
  type AbilityCfg,
  type AbilityKind,
} from "@/server/api/beta-raid/abilities";

/**
 * Настройка способностей цели — одна и та же для босса, сундука и шахты.
 * Значения вводятся как награды дропов: фиксом «5» или диапазоном «5-10».
 */
export function AbilitiesEditor({
  value,
  onChange,
}: {
  value: AbilityCfg[];
  onChange: (next: AbilityCfg[]) => void;
}) {
  const byKind = new Map(value.map((a) => [a.kind, a]));

  const toggle = (kind: AbilityKind) => {
    if (byKind.has(kind)) {
      onChange(value.filter((a) => a.kind !== kind));
      return;
    }
    const d = ABILITY_META[kind].defaults;
    onChange([...value, { kind, chance: d.chance, value: d.value, duration: d.duration }]);
  };

  const patch = (kind: AbilityKind, part: Partial<AbilityCfg>) => {
    onChange(value.map((a) => (a.kind === kind ? { ...a, ...part } : a)));
  };

  return (
    <div className="space-y-2 rounded-2xl border border-border/60 bg-secondary/20 p-3">
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-gold" />
        Способности
        <span className="text-[11px] font-normal text-muted-foreground">
          шанс проверяется каждый раунд
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ABILITY_KINDS.map((kind) => {
          const on = byKind.has(kind);
          return (
            <button
              key={kind}
              type="button"
              onClick={() => toggle(kind)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                on
                  ? "border-gold/50 bg-gold/10 text-gold"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {ABILITY_META[kind].label}
            </button>
          );
        })}
      </div>

      {value.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Ни одна не включена — цель бьёт обычным ударом.
        </p>
      ) : (
        <div className="space-y-2">
          {value.map((a) => {
            const meta = ABILITY_META[a.kind];
            return (
              <div key={a.kind} className="rounded-xl border border-border bg-background p-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{meta.label}</span>
                  <button
                    type="button"
                    onClick={() => toggle(a.kind)}
                    className="rounded-lg p-1 text-muted-foreground transition hover:text-destructive"
                    title="Убрать способность"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="text-[11px] text-muted-foreground">
                    Шанс, %
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={a.chance}
                      onChange={(e) => patch(a.kind, { chance: Number(e.target.value) || 0 })}
                      className="mt-1 w-full rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-sm text-foreground outline-none focus:border-gold/50"
                    />
                  </label>

                  {/* У оглушения и снятия иммунитетов силы нет — только шанс и минуты. */}
                  {a.kind !== "stun" && a.kind !== "strip_immune" && (
                    <label className="text-[11px] text-muted-foreground">
                      {meta.valueLabel}
                      <input
                        value={String(a.value ?? "")}
                        placeholder="5 или 5-10"
                        onChange={(e) => patch(a.kind, { value: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-sm text-foreground outline-none focus:border-gold/50"
                      />
                    </label>
                  )}

                  {meta.durationLabel && (
                    <label className="text-[11px] text-muted-foreground">
                      Длительность, {meta.durationLabel}
                      <input
                        value={String(a.duration ?? "")}
                        placeholder="2 или 1-3"
                        onChange={(e) => patch(a.kind, { duration: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-sm text-foreground outline-none focus:border-gold/50"
                      />
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
