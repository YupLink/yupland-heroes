// Фильтр покупателей магазина (админ): МУЛЬТИВЫБОР рас и специализаций галками.
// Можно отметить несколько сразу — бэкенд хранит массивы и проверяет includes().
// Пустой список = покупают все. Админ-UI по-русски (канон-подписи из heroMeta).
import { RACES, SPECIALIZATIONS } from "@/components/heroMeta";

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function ChipGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: readonly string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase text-muted-foreground">
        <span>{title}</span>
        {selected.length === 0 ? <span className="normal-case">пусто = все</span> : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const on = selected.includes(opt);
          return (
            <label
              key={opt}
              className={`cursor-pointer select-none rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                on
                  ? "border-gold bg-gold/20 text-gold"
                  : "border-border bg-background/40 text-muted-foreground"
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => onToggle(opt)}
                className="sr-only"
              />
              {opt}
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function MarketBuyerFilter({
  races,
  specs,
  onRaces,
  onSpecs,
}: {
  races: string[];
  specs: string[];
  onRaces: (v: string[]) => void;
  onSpecs: (v: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <ChipGroup
        title="Расы"
        options={RACES}
        selected={races}
        onToggle={(v) => onRaces(toggle(races, v))}
      />
      <ChipGroup
        title="Специализации"
        options={SPECIALIZATIONS}
        selected={specs}
        onToggle={(v) => onSpecs(toggle(specs, v))}
      />
    </div>
  );
}
