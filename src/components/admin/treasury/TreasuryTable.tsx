// Главная таблица казны: по каждому токену — что должны игрокам и чем покрыто.
//
// Таблица широкая сознательно: это отчёт, а не витрина. Поэтому она едет по
// горизонтали внутри своего контейнера, а страница по горизонтали не двигается.
import { AlertTriangle, Check } from "lucide-react";

export type TreasuryRowView = {
  token: string;
  decimals: number;
  deposited: number;
  spent: number;
  withdrawn: number;
  adjusted: number;
  onAccounts: number;
  unpaidRewards: number;
  owed: number;
  operating: number | null;
  reserve: number | null;
  free: number | null;
  coverage: number | null;
};

function num(v: number | null, dp = 2): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("ru-RU", { maximumFractionDigits: dp });
}

function Cell({ value, dim, danger }: { value: string; dim?: boolean; danger?: boolean }) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-2 text-right font-mono text-[12px] tabular-nums ${
        danger ? "text-red-400" : dim ? "text-muted-foreground" : "text-foreground"
      }`}
    >
      {value}
    </td>
  );
}

export function TreasuryTable({ rows }: { rows: TreasuryRowView[] }) {
  // Токены без оборота прячем: реестр на 20 позиций, живых обычно 12.
  const live = rows.filter((r) => r.owed !== 0 || r.deposited !== 0 || (r.operating ?? 0) !== 0);

  if (live.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border/60 bg-secondary/10 px-4 py-6 text-center text-sm text-muted-foreground">
        Оборота пока нет — ни обязательств, ни остатков.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/40">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 text-left font-semibold">Токен</th>
            <th className="px-3 py-2 text-right font-semibold">Пополнено</th>
            <th className="px-3 py-2 text-right font-semibold">Потрачено</th>
            <th className="px-3 py-2 text-right font-semibold">Выведено</th>
            <th className="px-3 py-2 text-right font-semibold">На счетах</th>
            <th className="px-3 py-2 text-right font-semibold">Награды</th>
            <th className="px-3 py-2 text-right font-semibold text-gold">Должны</th>
            <th className="px-3 py-2 text-right font-semibold">Операционный</th>
            <th className="px-3 py-2 text-right font-semibold">Резервный</th>
            <th className="px-3 py-2 text-right font-semibold">Свободно</th>
            <th className="px-3 py-2 text-right font-semibold">Покрытие</th>
          </tr>
        </thead>
        <tbody>
          {live.map((r) => {
            const short = r.free !== null && r.free < 0;
            return (
              <tr
                key={r.token}
                className={`border-b border-border/30 last:border-0 ${short ? "bg-red-500/5" : ""}`}
              >
                <td className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {short ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                    ) : (
                      <Check className="h-3.5 w-3.5 text-emerald-500/60" />
                    )}
                    {r.token}
                  </span>
                </td>
                <Cell value={num(r.deposited)} dim={r.deposited === 0} />
                <Cell value={num(r.spent)} dim={r.spent === 0} />
                <Cell value={num(r.withdrawn)} dim={r.withdrawn === 0} />
                <Cell value={num(r.onAccounts)} dim={r.onAccounts === 0} />
                <Cell value={num(r.unpaidRewards)} dim={r.unpaidRewards === 0} />
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[12px] font-bold tabular-nums text-gold">
                  {num(r.owed)}
                </td>
                <Cell value={num(r.operating)} />
                <Cell value={num(r.reserve)} />
                <Cell value={num(r.free)} danger={short} />
                <td
                  className={`whitespace-nowrap px-3 py-2 text-right font-mono text-[12px] tabular-nums ${
                    short ? "font-bold text-red-400" : "text-muted-foreground"
                  }`}
                >
                  {r.coverage === null ? "—" : `${num(r.coverage, 0)} %`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
