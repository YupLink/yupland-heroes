// Уровень босса: выбрать из списка или вписать своё.
//
// Раньше уровень жил внутри имени («Горный Хомяк (1 Lv)») — по такой строке
// нельзя ни отобрать боссов, ни восстановить их пачкой. Теперь это отдельное
// поле, и оно же лежит отдельной колонкой в базе.
//
// Список и ручной ввод рядом не для красоты: с телефона ткнуть в готовое
// значение быстрее, а «43» из списка на сотню пунктов искать замучаешься.
import { cn } from "@/lib/utils";

/** Частые уровни — то, чем размечают карту чаще всего. */
const QUICK = [1, 2, 3, 5, 10, 15, 20, 25, 30, 50, 75, 100];

export const MIN_BOSS_LEVEL = 1;
export const MAX_BOSS_LEVEL = 100;

/** Загнать любое введённое число в 1..100: база держит тот же диапазон. */
export function clampBossLevel(raw: number): number {
  if (!Number.isFinite(raw)) return MIN_BOSS_LEVEL;
  return Math.min(MAX_BOSS_LEVEL, Math.max(MIN_BOSS_LEVEL, Math.round(raw)));
}

export function BossLevelField({
  level,
  onChange,
}: {
  level: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Уровень босса
      </div>
      <div className="flex items-center gap-2">
        <select
          value={QUICK.includes(level) ? String(level) : ""}
          onChange={(e) => onChange(clampBossLevel(Number(e.target.value)))}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Свой уровень…</option>
          {QUICK.map((n) => (
            <option key={n} value={n}>
              {n} Lv
            </option>
          ))}
        </select>
        <input
          type="number"
          min={MIN_BOSS_LEVEL}
          max={MAX_BOSS_LEVEL}
          value={level}
          onChange={(e) => onChange(clampBossLevel(Number(e.target.value)))}
          className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-center text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {QUICK.slice(0, 6).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              "rounded-lg border-2 px-2.5 py-1 text-[11px] font-bold transition",
              level === n
                ? "border-gold bg-gold/10 text-gold"
                : "border-border text-muted-foreground hover:border-gold/50",
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
