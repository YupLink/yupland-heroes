// YUPLINK · «Сумма к распределению» на экране раздачи DARAI.
//
// По умолчанию делим доступное (баланс минус игровой пул под карту), а не
// весь кошелёк. Свой объём вводить можно любой — но если он залезает в пул
// под карту или в деньги игроков, честно об этом говорим. Не блокируем:
// деньги владельца, решение тоже его.

import { Coins, AlertTriangle } from "lucide-react";
import { fmt, type DaraiPreview } from "./daraiPayoutShared";

/** Что именно нарушает введённая сумма — считаем один раз, рисуем списком. */
function buildWarnings(d: DaraiPreview, amount: number): string[] {
  const { walletBalance, payoutAvailable, playerObligations } = d.pools;
  const available = Math.max(0, payoutAvailable);
  const out: string[] = [];

  if (amount > walletBalance) {
    // Дальше считать нечего: рассылка всё равно не пройдёт, а «после
    // рассылки останется…» на несуществующие деньги только путает.
    out.push(
      `На коше всего ${fmt(walletBalance)} DARAI — не хватает ${fmt(
        amount - walletBalance
      )}. Рассылка не пройдёт.`
    );
    return out;
  }
  if (amount > available) {
    out.push(
      `Сверх доступного ${fmt(available)} DARAI берётся ещё ${fmt(
        amount - available
      )} — это игровой пул, отложенный под награды на карте.`
    );
  }

  const leftAfter = walletBalance - amount;
  if (leftAfter < playerObligations) {
    out.push(
      `После рассылки на коше останется ${fmt(
        Math.max(0, leftAfter)
      )} DARAI, а игрокам должны ${fmt(playerObligations)} — на выводы не хватит ${fmt(
        playerObligations - leftAfter
      )}.`
    );
  }
  return out;
}

export function DaraiAmountCard({
  d,
  value,
  onChange,
}: {
  d: DaraiPreview;
  value: string;
  onChange: (v: string) => void;
}) {
  // Предупреждения считаем от того, что в поле ПРЯМО СЕЙЧАС (без debounce):
  // цифры суммы догоняют через 600 мс, а вот «ты лезешь в чужое» лучше
  // показать сразу.
  const live = Number(value.replace(/[^\d.]/g, ""));
  const liveNum = Number.isFinite(live) && live > 0 ? live : null;
  const warnings = liveNum ? buildWarnings(d, liveNum) : [];

  return (
    <div className="rounded-2xl border border-neon/30 bg-neon/5 p-4">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-neon">
        <Coins className="h-3.5 w-3.5" /> Сумма к распределению
      </div>
      {/* На узком экране блоки идут друг под другом: в одну строку поле ввода
          сжималось до пары символов рядом с длинным числом. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-0">
          <div className="text-[10px] text-muted-foreground">
            Сейчас считаем от
          </div>
          <div className="font-mono text-2xl font-bold leading-tight text-foreground">
            {fmt(d.totalHuman)} <span className="text-base">DARAI</span>
          </div>
        </div>
        <div className="min-w-0 w-full sm:max-w-xs sm:flex-1">
          <label className="block text-[10px] text-muted-foreground">
            Свой объём (по умолчанию = доступное к раздаче)
          </label>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`${fmt(d.availableHuman)}`}
            className="mt-0.5 w-full rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-sm outline-none focus:border-neon/50"
          />
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {liveNum
              ? `считаем от ${fmt(liveNum)}`
              : `пусто = доступное к раздаче (${fmt(d.availableHuman)})`}
          </div>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mt-3 space-y-1 rounded-xl border border-amber-400/40 bg-amber-400/10 p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-300">
            <AlertTriangle className="h-3 w-3" /> Сумма выходит за доступное
          </div>
          {warnings.map((w) => (
            <div key={w} className="text-[10px] leading-relaxed text-amber-100">
              {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
