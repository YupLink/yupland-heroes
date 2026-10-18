// Границы уровня героя у портала: «от» и «до» — каждая своей галкой.
//
// Одной галкой на обе границы нельзя было задать «только от пятого» или
// «только до десятого» — а это разные правила: первое отсекает новичков,
// второе бережёт низкоуровневую зону от прокачанных.
export function PortalLevelRange({
  fromOn,
  from,
  toOn,
  to,
  onChange,
}: {
  fromOn: boolean;
  from: number;
  toOn: boolean;
  to: number;
  onChange: (patch: {
    levelFromOn?: boolean;
    levelFrom?: number;
    levelToOn?: boolean;
    levelTo?: number;
  }) => void;
}) {
  const num = (v: string) => Math.max(1, Math.min(100, Math.round(Number(v) || 1)));
  const field =
    "w-16 rounded-lg border border-border bg-background px-2 py-1 text-xs disabled:opacity-40";

  return (
    <div className="mb-2 space-y-1.5">
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Уровень героя
      </span>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={fromOn}
          onChange={(e) => onChange({ levelFromOn: e.target.checked })}
          className="h-4 w-4 accent-violet-400"
        />
        <span className="w-8 text-xs">от</span>
        <input
          type="number"
          min={1}
          max={100}
          value={from}
          disabled={!fromOn}
          onChange={(e) => onChange({ levelFrom: num(e.target.value) })}
          className={field}
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={toOn}
          onChange={(e) => onChange({ levelToOn: e.target.checked })}
          className="h-4 w-4 accent-violet-400"
        />
        <span className="w-8 text-xs">до</span>
        <input
          type="number"
          min={1}
          max={100}
          value={to}
          disabled={!toOn}
          onChange={(e) => onChange({ levelTo: num(e.target.value) })}
          className={field}
        />
      </label>
    </div>
  );
}
