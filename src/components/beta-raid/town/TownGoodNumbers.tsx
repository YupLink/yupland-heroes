// Числа товара ратуши в пульте админа (владелец, 03.10.2026): задаются только
// цена при норме (×1), норма в день на ОДНОГО жителя и (необязательно)
// производство. Всё остальное считается: расход города в день = жители × норма
// на жителя, норма склада = 10 дней расхода (не едят — 10 дней производства),
// НЗ — % от неё. Меняются жители — цифры города следом.
import { NumField } from "../market/NumField";
import { cityNorm, dailyNeed, NORM_DAYS, type TownGood } from "@/lib/townConfig";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-2 py-1 text-sm tabular-nums";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("ru-RU");

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="mt-0.5 block text-[10px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function TownGoodNumbers({
  good,
  residents,
  onChange,
}: {
  good: TownGood;
  residents: number;
  onChange: (patch: Partial<TownGood>) => void;
}) {
  const perDay = dailyNeed(good, residents);
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Цена при норме (×1)">
        <NumField
          value={good.marketPrice}
          onChange={(v) => onChange({ marketPrice: v ?? 0 })}
          className={inputClass}
        />
      </Field>
      <Field
        label="Норма в день на жителя"
        hint={
          perDay > 0
            ? `город в день ${fmt(perDay)} · норма ${fmt(cityNorm(good, residents))} (${NORM_DAYS} дн.)`
            : good.producePerDay > 0
              ? `не едят · норма ${fmt(cityNorm(good, residents))} (${NORM_DAYS} дн. производства)`
              : residents > 0
                ? "не едят и не производят — норма 1"
                : "задайте жителей"
        }
      >
        <NumField
          value={good.consumePerResident}
          onChange={(v) => onChange({ consumePerResident: v ?? 0 })}
          className={inputClass}
        />
      </Field>
      <Field label="Производство в день">
        <NumField
          value={good.producePerDay}
          onChange={(v) => onChange({ producePerDay: v ?? 0 })}
          className={inputClass}
        />
      </Field>
      <Field label="Наценка продажи, %" hint={good.markupPct == null ? "как у города" : undefined}>
        <NumField
          value={good.markupPct ?? null}
          onChange={(v) => onChange({ markupPct: v ?? undefined })}
          className={inputClass}
        />
      </Field>
    </div>
  );
}
