// Шесть шансов смены погоды (владелец, 28.10.2026): из какой погоды в какую и куда пойдёт
// температура. Остаток до 100 % — «останется той же», считается сам. Поля карточки
// «Смена погоды» (WeatherOddsCard).
import type { WeatherOdds } from "@/lib/raid/weatherOdds";

type Key = keyof WeatherOdds;

const fmtPct = (n: number) =>
  Number.isFinite(n) ? String(Math.round(n * 10) / 10).replace(".", ",") : "∞";

function Pct({
  label,
  k,
  odds,
  set,
  disabled,
}: {
  label: string;
  k: Key;
  odds: WeatherOdds;
  set: (k: Key, v: number) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={100}
        step={1}
        value={odds[k]}
        disabled={disabled}
        onChange={(e) => set(k, Math.trunc(Number(e.target.value) || 0))}
        className="h-9 w-16 rounded-lg border border-border bg-background px-2 text-right"
      />
      %
    </label>
  );
}

const Stay = ({ p }: { p: number }) => (
  <span className="text-sm text-muted-foreground">остаётся {fmtPct(p)} %</span>
);

export function WeatherOddsFields({
  odds,
  set,
  disabled,
}: {
  odds: WeatherOdds;
  set: (k: Key, v: number) => void;
  disabled: boolean;
}) {
  const row = "flex flex-wrap items-center gap-x-4 gap-y-1";
  const name = "w-20 text-sm font-semibold";
  return (
    <div className="space-y-2">
      <div className={row}>
        <span className={name}>Ясно</span>
        <Pct label="→ пасмурно" k="clearToOvercast" odds={odds} set={set} disabled={disabled} />
        <Stay p={100 - odds.clearToOvercast} />
      </div>
      <div className={row}>
        <span className={name}>Пасмурно</span>
        <Pct label="→ ясно" k="overcastToClear" odds={odds} set={set} disabled={disabled} />
        <Pct label="→ шторм" k="overcastToStorm" odds={odds} set={set} disabled={disabled} />
        <Stay p={100 - odds.overcastToClear - odds.overcastToStorm} />
      </div>
      <div className={row}>
        <span className={name}>Шторм</span>
        <Pct label="→ пасмурно" k="stormToOvercast" odds={odds} set={set} disabled={disabled} />
        <Stay p={100 - odds.stormToOvercast} />
      </div>
      <div className={`${row} pt-1`}>
        <span className={name}>Темп.</span>
        <Pct label="−10°" k="tempDown" odds={odds} set={set} disabled={disabled} />
        <Pct label="+10°" k="tempUp" odds={odds} set={set} disabled={disabled} />
        <span className="text-sm text-muted-foreground">
          та же {fmtPct(100 - odds.tempDown - odds.tempUp)} %
        </span>
      </div>
    </div>
  );
}
