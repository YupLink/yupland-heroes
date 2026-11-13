// Статистика пулов банка — только админу (Архан, 21.10.2026; владелец: «графики и
// историю обмена — только админу, в стиле Ангелины»). По каждому пулу: курс сейчас
// и к стартовому, график курса, комиссия, объём, сколько вытащили, история обменов.
// Считает сервер по журналам (bank-stats.ts → lib/bankStats.ts).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { listBankPools } from "@/server/api/bank/bank-pools";
import { getBankPoolStats } from "@/server/api/bank/bank-stats";
import { tokenLabel, type BankPool } from "@/lib/castleBank";
import { changePct, rateView, viewPrice } from "@/lib/bankStats";
import { BANK_POOLS_KEY, BANK_STATS_KEY } from "./bankKeys";
import { TokenBadge } from "./bankUi";
import { fmtPct, fmtRate } from "./bankStatsFmt";
import { BankRateChart } from "./BankRateChart";
import { BankFeesTable, BankOutflow, BankVolumeTable } from "./BankStatsTables";
import { BankSwapHistory } from "./BankSwapHistory";

type Stats = Awaited<ReturnType<typeof getBankPoolStats>>;

function RateHead({ s, ru }: { s: Stats; ru: boolean }) {
  const v = rateView(s.pool);
  const now = viewPrice(s.priceNow, v.invert);
  const pct = changePct(s.priceNow, s.priceStart, v.invert);
  return (
    <div className="space-y-1">
      <p className="flex flex-wrap items-center gap-2 text-sm text-[#d8ccb5]">
        <TokenBadge token={s.pool.tokenA} ru={ru} />
        <span className="text-[#bd9865]">⇄</span>
        <TokenBadge token={s.pool.tokenB} ru={ru} />
        <span className="text-xs text-[#a59c8c]">
          · {ru ? "комиссия" : "fee"} {s.pool.feePct} %
        </span>
      </p>
      <p className="font-['Auction_Russo'] text-xl text-[#fff0c7] tabular-nums">
        1 {tokenLabel(v.base, ru)} = {fmtRate(now, ru)} {tokenLabel(v.quote, ru)}
      </p>
      <p className="text-xs text-[#a59c8c] tabular-nums">
        {ru ? "старт" : "start"} {fmtRate(viewPrice(s.priceStart, v.invert), ru)} ·{" "}
        <b className={pct >= 0 ? "text-[#8df0b6]" : "text-[#f0b4ab]"}>{fmtPct(pct, ru)}</b>
        {" · "}1 {tokenLabel(v.quote, ru)} = {fmtRate(now > 0 ? 1 / now : 0, ru)} {tokenLabel(v.base, ru)}
      </p>
      {!s.consistent && (
        <p role="note" className="text-xs text-[#f0b4ab]">
          {ru
            ? "Журналы не сходятся с запасом пула — запас меняли мимо обменов и наполнений"
            : "Logs don't match the pool reserve — it was changed outside swaps and funding"}
        </p>
      )}
    </div>
  );
}

function PoolStats({ pool, ru }: { pool: BankPool; ru: boolean }) {
  const q = useQuery({
    queryKey: [...BANK_STATS_KEY, pool.id],
    queryFn: () => getBankPoolStats({ data: { poolId: pool.id } }),
    staleTime: 30_000,
  });
  if (q.isPending)
    return (
      <p role="status" className="auction-loading">
        <Loader2 className="h-5 w-5 animate-spin" />
      </p>
    );
  if (q.isError)
    return (
      <p role="alert" className="auction-ledger text-sm text-[#f0b4ab]">
        {q.error instanceof Error ? q.error.message : String(q.error)}
      </p>
    );
  const s = q.data;
  const v = rateView(s.pool);
  const sides = [s.a, s.b];
  return (
    <>
      <section className="auction-ledger space-y-3" aria-label={ru ? "Курс" : "Rate"}>
        <RateHead s={s} ru={ru} />
        <BankRateChart
          key={pool.id}
          points={s.points}
          invert={v.invert}
          start={s.priceStart}
          unit={`${tokenLabel(v.quote, ru)} ${ru ? "за 1" : "per 1"} ${tokenLabel(v.base, ru)}`}
          ru={ru}
        />
      </section>
      <BankFeesTable sides={sides} ru={ru} />
      <BankVolumeTable sides={sides} swaps={s.swaps} ru={ru} />
      <BankOutflow sides={sides} lastFundAt={s.lastFundAt} ru={ru} />
      <BankSwapHistory poolId={pool.id} ru={ru} />
    </>
  );
}

export function BankStats({ ru }: { ru: boolean }) {
  const pools = useQuery({ queryKey: BANK_POOLS_KEY, queryFn: () => listBankPools() });
  const [poolId, setPoolId] = useState("");
  const list = pools.data ?? [];
  const pool = list.find((p) => p.id === poolId) ?? list[0];
  return (
    <>
      <section className="auction-ledger" aria-labelledby="bank-stats-title">
        <h2 id="bank-stats-title" className="mb-2 font-['Auction_Russo'] text-lg text-[#fff0c7]">
          {ru ? "Статистика пулов" : "Pool stats"}
        </h2>
        {pools.isPending ? (
          <p role="status">{ru ? "Загрузка…" : "Loading…"}</p>
        ) : pools.isError ? (
          <p role="alert">{pools.error instanceof Error ? pools.error.message : String(pools.error)}</p>
        ) : list.length ? (
          <div className="auction-pills" role="tablist" aria-label={ru ? "Пул" : "Pool"}>
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={p.id === pool?.id}
                className={`auction-pill${p.id === pool?.id ? " auction-pill--on" : ""}`}
                onClick={() => setPoolId(p.id)}
              >
                {tokenLabel(p.tokenA, ru)} ⇄ {tokenLabel(p.tokenB, ru)}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#a59c8c]">{ru ? "Пулов нет" : "No pools"}</p>
        )}
      </section>
      {pool && <PoolStats key={pool.id} pool={pool} ru={ru} />}
    </>
  );
}
