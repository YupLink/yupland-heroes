// Порог по «пройденной» энергии: галка + число. Считается энергия, потраченная
// только на шаги по клеткам (не на бой, не на порталы). До порога портал/дверь
// не пустят — так же, как ограничение по уровню героя.
export function PortalMoveEnergyGate({
  on,
  value,
  onChange,
}: {
  on: boolean;
  value: number;
  onChange: (p: { moveEnergyMinOn: boolean; moveEnergyMin: number }) => void;
}) {
  return (
    <div className="mb-2 flex items-center gap-2 text-[11px]">
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-violet-400"
          checked={on}
          onChange={(e) => onChange({ moveEnergyMinOn: e.target.checked, moveEnergyMin: value })}
        />
        Пропускать после
      </label>
      <input
        type="number"
        min={0}
        step={1}
        disabled={!on}
        value={value}
        onChange={(e) =>
          onChange({ moveEnergyMinOn: on, moveEnergyMin: Math.max(0, Math.round(Number(e.target.value) || 0)) })
        }
        className="w-20 rounded-md border border-violet-500/30 bg-background px-2 py-1 text-right disabled:opacity-50"
      />
      <span className="text-muted-foreground">⚡ по клеткам</span>
    </div>
  );
}
