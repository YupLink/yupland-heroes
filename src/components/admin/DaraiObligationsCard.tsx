// YUPLINK · Обязательства перед игроками на экране раздачи DARAI.
//
// Зачем: часть DARAI на коше — чужие. Люди заводили свои токены в игру и в
// любой момент могут попросить их обратно. Награды сюда не входят — их мы
// начислили сами. Эта цифра показывает, сколько денег должно быть на коше
// «про запас», чтобы вывод не встал.

import { HandCoins, ShieldCheck, AlertTriangle } from "lucide-react";
import { fmt, type DaraiPreview } from "./daraiPayoutShared";

export function DaraiObligationsCard({ d }: { d: DaraiPreview }) {
  const { playerObligations, walletBalance } = d.pools;
  const gap = walletBalance - playerObligations;
  const covered = gap >= 0;

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 transition hover:border-border/80">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
        <HandCoins className="h-3.5 w-3.5" />
        Обязательства перед игроками
      </div>

      <div className="font-mono text-2xl font-bold leading-tight text-foreground">
        {fmt(playerObligations)} <span className="text-base">DARAI</span>
      </div>
      <div className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
        игроки завели своими руками и ещё не вывели. Награды за игру сюда не
        входят — это то, что мы обязаны отдать по первому требованию.
      </div>

      {covered ? (
        <div className="mt-2 flex items-start gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-2 text-[10px] leading-relaxed text-emerald-200">
          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Обеспечено: на коше{" "}
            <span className="font-mono">{fmt(walletBalance)}</span> DARAI, запас
            сверх обязательств —{" "}
            <span className="font-mono">{fmt(gap)}</span> DARAI.
          </span>
        </div>
      ) : (
        <div className="mt-2 flex items-start gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 p-2 text-[10px] leading-relaxed text-rose-200">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Не обеспечено: на коше{" "}
            <span className="font-mono">{fmt(walletBalance)}</span> DARAI, до
            покрытия не хватает{" "}
            <span className="font-mono font-bold">{fmt(Math.abs(gap))}</span>{" "}
            DARAI. Если игроки придут выводить, деньги придётся довносить.
          </span>
        </div>
      )}
    </div>
  );
}
