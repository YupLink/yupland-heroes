// Мелкие поля редактора предметов: «лейбл + селект» и «селект + число».
// Отдельным файлом, чтобы редактор влезал в 250 строк (§13 ПРАВИЛА.md).

/** Лейбл + селект (варианты из списка, опц. пустой «—»). */
export function FieldSel({
  label,
  value,
  onChange,
  opts,
  empty,
  renderOpt,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  opts: string[];
  empty?: boolean;
  renderOpt?: (v: string) => string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
      >
        {empty && <option value="">—</option>}
        {opts.map((o) => (
          <option key={o} value={o}>
            {renderOpt ? renderOpt(o) : o}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Селект (из списка) + число «+N». Для хар-ки/расы/спец с количеством. */
export function SelAmt({
  label,
  sel,
  onSel,
  opts,
  amt,
  onAmt,
  renderOpt,
}: {
  label: string;
  sel: string;
  onSel: (v: string) => void;
  opts: string[];
  amt: string;
  onAmt: (v: string) => void;
  renderOpt?: (v: string) => string;
}) {
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span className="w-11 shrink-0">{label}</span>
      <select
        value={sel}
        onChange={(e) => onSel(e.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-1.5 py-1.5 text-sm"
      >
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {renderOpt ? renderOpt(o) : o}
          </option>
        ))}
      </select>
      <input
        type="number"
        value={amt}
        onChange={(e) => onAmt(e.target.value)}
        placeholder="+"
        className="w-12 shrink-0 rounded-lg border border-border bg-background px-1.5 py-1 text-sm"
      />
    </div>
  );
}
