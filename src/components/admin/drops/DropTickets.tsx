import { Gift, Repeat } from "lucide-react";

export function FreeClaimCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-secondary/30 p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-gold"
      />
      <div className="flex flex-1 items-center gap-1.5 text-sm font-medium">
        <Gift className="h-3.5 w-3.5 text-gold" />
        Бесплатно (без билетов)
      </div>
    </label>
  );
}

export function RecurringToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-secondary/30 p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-neon"
      />
      <div className="flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Repeat className="h-3.5 w-3.5 text-neon" />
          Авто-перезапуск каждые 30 дней
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          Дроп не завершится через 30 дней, а пересоздастся сам — юзеры
          клеймят награду по своим NFT заново раз в 30 дней. По умолчанию
          выключено.
        </div>
      </div>
    </label>
  );
}

export function TicketCostInput({
  value,
  onChange,
  claimLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  claimLabel: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3">
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">
          Стоимость в билетах за {claimLabel}
        </span>
        <input
          type="number"
          min={0.01}
          step={0.01}
          value={value}
          placeholder="0.01"
          onChange={(e) => onChange(e.target.value)}
          className="w-20 rounded-md border border-border bg-background px-2 py-1 text-right font-mono text-sm outline-none focus:border-gold/50"
        />
      </label>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Сколько билетов спишется с юзера за один клейм. По умолчанию 1.
        При стирании поля используется 1.
      </p>
    </div>
  );
}
