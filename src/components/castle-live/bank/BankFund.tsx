// Наполнение пула (админ): сколько положить первой стороны — вторую сервер считает
// сам (пул пуст — по стартовому курсу, есть запас — в пропорции). Монеты (DARAI, USDT,
// звёзды…) — с 29.10.2026 с основного кошелька игры, ни с чьего счёта: под стороной
// видно «свободно» (тот же расчёт, что полоска над картой), больше — сервер откажет.
// Ресурсы выпускает игра. Ждущий откуп золота — сразу после.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { fundBankPool } from "@/server/api/bank/bank-swap";
import { getFreeTokenPools } from "@/server/api/token-free-pool";
import { isBankResource, tokenLabel, type BankPool, type BankToken } from "@/lib/castleBank";
import { fundPair } from "@/lib/bankSwap";
import { BANK_POOLS_KEY, fmtNum } from "./bankUi";
import { BANK_LICENSE_KEY } from "./BankLicenses";
import { BANK_STATS_KEY } from "./bankKeys";

/** Префикс ключа «свободно» (AdminFreeTokenBar: ["free-token-pools", символ…]). */
const FREE_KEY = "free-token-pools";

export function BankFund({ pool, ru, onDone }: { pool: BankPool; ru: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const [a, setA] = useState("");
  const amountA = Number(a.replace(",", ".").trim());
  const ok = Number.isFinite(amountA) && amountA > 0;
  const amountB = ok ? fundPair(pool, amountA) : 0;
  // Пулы с DARAI наполняются со счёта админа (bank-swap.ts), остальные монеты — с основного кошелька.
  const darai = pool.tokenA === "Darai" || pool.tokenB === "Darai";
  const coins = darai ? [] : [pool.tokenA, pool.tokenB].filter((t) => !isBankResource(t));
  const freeQ = useQuery({
    queryKey: [FREE_KEY, ...coins],
    queryFn: () => getFreeTokenPools({ data: { symbols: coins } }),
    enabled: coins.length > 0,
  });
  const fund = useMutation({
    mutationFn: () => fundBankPool({ data: { poolId: pool.id, amountA, opId: crypto.randomUUID() } }),
    onSuccess: () => {
      toast.success(ru ? "Пул пополнен" : "Pool funded");
      onDone();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
    onSettled: () => {
      for (const key of [BANK_POOLS_KEY, BANK_LICENSE_KEY, BANK_STATS_KEY, [FREE_KEY]]) void qc.invalidateQueries({ queryKey: key });
    },
  });
  /** Под монетной стороной: откуда монеты и сколько их свободно. */
  const source = (t: BankToken) => {
    if (isBankResource(t)) return null;
    if (darai) return <p className="text-xs text-[#a59c8c]">{ru ? "со счёта админа" : "from the admin account"}</p>;
    const free = freeQ.data?.find((p) => p.symbol === t)?.free;
    const n = freeQ.isPending ? "…" : free == null ? "—" : fmtNum(free, ru);
    return (
      <p className="text-xs text-[#a59c8c]">
        {ru ? `с основного кошелька, свободно ${n}` : `from the main wallet, free ${n}`}
      </p>
    );
  };
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-[#ffffff1f] bg-[#0d1b2b] p-3">
      <label className="flex items-center gap-2 text-sm">
        <span className="w-28 shrink-0 text-[#cdb791]">{tokenLabel(pool.tokenA, ru)}</span>
        <input className="auction-field flex-1" inputMode="decimal" placeholder="0" value={a} onChange={(e) => setA(e.target.value)} />
      </label>
      {source(pool.tokenA)}
      <p className="flex items-center gap-2 text-sm">
        <span className="w-28 shrink-0 text-[#cdb791]">{tokenLabel(pool.tokenB, ru)}</span>
        <b className="text-[#fff0c7]">{ok ? fmtNum(amountB, ru) : "—"}</b>
      </p>
      {source(pool.tokenB)}
      <div className="flex gap-2">
        <button type="button" className="auction-secondary flex-1" onClick={onDone}>
          {ru ? "Отмена" : "Cancel"}
        </button>
        <button type="button" className="auction-primary flex-1" disabled={!ok || !(amountB > 0) || fund.isPending} onClick={() => fund.mutate()}>
          {fund.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {ru ? "Положить" : "Add"}
        </button>
      </div>
    </div>
  );
}
