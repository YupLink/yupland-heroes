import { MAX_PACK_QTY, parsePackQty } from "./helpers";

/**
 * Поле «сколько паков за один клейм». Одно и то же в простой награде и в
 * ярусном редакторе — поэтому отдельный модуль, а не две копии инпута.
 */
export function PackQtyInput({
  value,
  onChange,
  packName,
}: {
  value: string;
  onChange: (v: string) => void;
  packName?: string;
}) {
  const qty = parsePackQty(value);
  const invalid = value.trim().length > 0 && String(qty) !== value.trim();
  return (
    <div className="mt-2">
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">Сколько паков за 1 клейм</span>
        <input
          type="number"
          min={1}
          max={MAX_PACK_QTY}
          step={1}
          value={value}
          placeholder="1"
          onChange={(e) => onChange(e.target.value)}
          className="w-20 rounded-md border border-border bg-background px-2 py-1 text-right font-mono text-sm outline-none focus:border-gold/50"
        />
      </label>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {qty > 1
          ? `Юзер получит ${qty} ${packName ? `«${packName}»` : "паков"} за один клейм — отдельные дропы создавать не нужно.`
          : `По умолчанию 1. Максимум ${MAX_PACK_QTY}. При стирании поля используется 1.`}
        {invalid && <span className="text-amber-300"> Сохранится как {qty}.</span>}
      </p>
    </div>
  );
}
