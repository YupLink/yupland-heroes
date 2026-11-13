// Курс выбранной пары во вкладке «Обмен» (владелец, 23.10.2026; любая пара — 25.10.2026): свечи 1ч / 4ч / 1д,
// вид — линия или свечи, как в обычном биржевом графике; по умолчанию шаг 1 час.
// Курс считается после каждого обмена, поэтому последняя свеча живая: пока вкладка
// открыта, график перечитывается раз в 15 с, после своего обмена — сразу
// (BANK_RATE_KEY в refreshBank). Все три шага приходят одним ответом — переключение
// без ожидания.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChartCandlestick, ChartLine, type LucideIcon } from "lucide-react";
import { getBankRate } from "@/server/api/bank/bank-rate";
import { changePct, viewPrice } from "@/lib/bankStats";
import { RATE_STEP_IDS, type RateStep } from "@/lib/bankRate";
import { tokenLabel } from "@/lib/castleBank";
import { BANK_RATE_KEY } from "./bankKeys";
import { BankCandleChart, type RateMode } from "./BankCandleChart";
import { fmtPct, fmtRate } from "./bankStatsFmt";
import { fmtSpan, stepLabel } from "./bankRateFmt";

export function BankRateHistory({ ru, poolId }: { ru: boolean; poolId?: string }) {
  const [step, setStep] = useState<RateStep>("1h");
  const [mode, setMode] = useState<RateMode>("line");
  // Границы 4ч и 1д — по местному времени игрока, а не по UTC.
  const tz = -new Date().getTimezoneOffset();
  const q = useQuery({
    queryKey: poolId ? [...BANK_RATE_KEY, tz, poolId] : [...BANK_RATE_KEY, tz],
    queryFn: () => getBankRate({ data: poolId ? { tz, poolId } : { tz } }),
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
  const r = q.data;
  const cs = r?.candles?.[step];
  // Нет пула, ответ старой формы из кэша или курс чужой пары (пару сменили) — блока нет.
  if (!r || !Array.isArray(cs) || cs.length === 0) return null;
  if (poolId && r.poolId && r.poolId !== poolId) return null;
  const now = cs[cs.length - 1].c;
  const change = changePct(now, cs[0].o, r.invert);
  const span = fmtSpan(cs, step, ru);
  const baseLabel = r.base === "gold" ? (ru ? "золото" : "gold") : tokenLabel(r.base, ru);
  const modes: Array<[RateMode, string, LucideIcon]> = [
    ["line", ru ? "Линия" : "Line", ChartLine],
    ["candles", ru ? "Свечи" : "Candles", ChartCandlestick],
  ];
  return (
    <section className="bank-player__chart" aria-label={ru ? `Курс за ${span}` : `Rate, ${span}`}>
      <div className="bank-player__rate-head">
        <div className="bank-player__rate-title">
          <h3>{ru ? `Курс ${tokenLabel(r.quote, ru)} / ${baseLabel}` : `${tokenLabel(r.quote, ru)} / ${baseLabel} rate`}</h3>
          <span>{ru ? `Динамика за ${span}` : `Past ${span}`}</span>
        </div>
        <span className="bank-player__rate-now">
          <b>1 {baseLabel} ≈ {fmtRate(viewPrice(now, r.invert), ru)} {tokenLabel(r.quote, ru)}</b>
          <small className={change >= 0 ? "bank-player__rate-up" : "bank-player__rate-down"}>{fmtPct(change, ru)}</small>
        </span>
      </div>
      <div className="bank-player__rate-tools">
        <div className="bank-player__seg" role="group" aria-label={ru ? "Шаг свечи" : "Candle step"}>
          {RATE_STEP_IDS.map((s) => (
            <button key={s} type="button" aria-pressed={step === s} onClick={() => setStep(s)}>
              {stepLabel(s, ru)}
            </button>
          ))}
        </div>
        <div className="bank-player__seg" role="group" aria-label={ru ? "Вид графика" : "Chart view"}>
          {modes.map(([m, label, Icon]) => (
            <button key={m} type="button" aria-pressed={mode === m} aria-label={label} title={label} onClick={() => setMode(m)}>
              <Icon aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
      <BankCandleChart
        key={step}
        candles={cs}
        mode={mode}
        step={step}
        invert={r.invert}
        unit={`${tokenLabel(r.quote, ru)} ${ru ? "за 1" : "per 1"} ${tokenLabel(r.base, ru)}`}
        ru={ru}
      />
    </section>
  );
}
