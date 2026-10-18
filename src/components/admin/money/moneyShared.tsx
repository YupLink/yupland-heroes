// Общие кусочки вкладки «Счета»: крупные суммы «1,8 млрд», карточка, строка,
// полоска долей. Под телефон: подпись переносится, а не обрезается; точное
// число — по нажатию на строку (подсказки при наведении на телефоне нет).
import { useState, type ReactNode } from "react";

/** 1 798 000 000 → «1,8 млрд», 48 531 030 → «48,5 млн», мелочь — как есть. */
export function big(v: number): string {
  const a = Math.abs(v);
  const ru = (x: number, d: number) => x.toLocaleString("ru-RU", { maximumFractionDigits: d });
  if (a >= 1e9) return `${ru(v / 1e9, 2)} млрд`;
  if (a >= 1e6) return `${ru(v / 1e6, 1)} млн`;
  return ru(v, 2);
}

export const exact = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

export function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-base font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Крупная сумма карточки. */
export function Hero({ value, unit }: { value: number; unit: string }) {
  return (
    <div className="font-display text-2xl font-bold tabular-nums" title={`${exact(value)} ${unit}`}>
      {big(value)} <span className="text-base font-semibold text-muted-foreground">{unit}</span>
    </div>
  );
}

export function Row({
  label,
  value,
  unit = "DARAI",
  tone,
  dot,
  sub,
}: {
  label: ReactNode;
  value: number;
  unit?: string;
  tone?: "accent" | "muted" | "danger";
  dot?: string;
  /** Подстрока мелким шрифтом под подписью. */
  sub?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const valueCls =
    tone === "accent"
      ? "font-bold text-gold"
      : tone === "danger"
        ? "font-semibold text-destructive"
        : tone === "muted"
          ? "text-muted-foreground"
          : "font-semibold";
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="flex w-full items-start justify-between gap-3 py-1 text-left text-[13px]"
    >
      <span className="flex min-w-0 items-start gap-2">
        {dot && <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />}
        <span className="min-w-0">
          <span className={`break-words ${tone === "muted" ? "text-muted-foreground" : ""}`}>{label}</span>
          {sub && <span className="block text-[11px] text-muted-foreground">{sub}</span>}
        </span>
      </span>
      <span className={`shrink-0 whitespace-nowrap text-right tabular-nums ${valueCls}`}>
        {big(value)} {unit}
        {open && <span className="block text-[11px] font-normal text-muted-foreground">{exact(value)}</span>}
      </span>
    </button>
  );
}

/** Полоска из долей: [{value, cls}] от общего total. */
export function Stack({ parts, total }: { parts: Array<{ value: number; cls: string }>; total: number }) {
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary">
      {parts.map((p, i) => (
        <div
          key={i}
          className={p.cls}
          style={{ width: `${total > 0 ? Math.max(0, Math.min(100, (p.value / total) * 100)) : 0}%` }}
        />
      ))}
    </div>
  );
}

/** Переключатель из двух-трёх вариантов. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ key: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg bg-secondary p-0.5 text-[12px] font-semibold">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`rounded-md px-3 py-1 ${value === o.key ? "bg-background text-foreground" : "text-muted-foreground"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
