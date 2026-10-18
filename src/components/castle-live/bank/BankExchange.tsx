// Обмен в банке (пока только админ): пул из наполненных, что отдаю, сколько. Предпросмотр
// считает та же формула, что база (lib/bankSwap): сколько получу, комиссия (80 % в
// пул, 20 % в пул карты), цена до и после. Продажа золота за DARAI — по лицензии с
// суточным лимитом; сервер откажет, если курс ушёл больше чем на 1 %.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownUp, Loader2 } from "lucide-react";
import { listBankPools } from "@/server/api/bank/bank-pools";
import { getBankLicense } from "@/server/api/bank/bank-license";
import { swapBank } from "@/server/api/bank/bank-swap";
import { tokenLabel, type BankPool, type BankToken } from "@/lib/castleBank";
import { poolLive, quote } from "@/lib/bankSwap";
import { licenseActive } from "@/lib/bankLicense";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";
import { RESOURCES_KEY, useResources } from "@/lib/hooks/useResources";
import { BANK_POOLS_KEY, fmtNum } from "./bankUi";
import { BANK_LICENSE_KEY } from "./BankLicenses";

const isSellGold = (p: BankPool, t: BankToken) => p.tokenA === "gold" && p.tokenB === "Darai" && t === "gold";

export function BankExchange({ ru }: { ru: boolean }) {
  const qc = useQueryClient();
  const pools = useQuery({ queryKey: BANK_POOLS_KEY, queryFn: () => listBankPools() });
  const lic = useQuery({ queryKey: BANK_LICENSE_KEY, queryFn: () => getBankLicense() });
  const res = useResources();
  const live = (pools.data ?? []).filter(poolLive);
  const [poolId, setPoolId] = useState<string>("");
  const [tokenIn, setTokenIn] = useState<BankToken | null>(null);
  const [amount, setAmount] = useState("");
  const pool = live.find((p) => p.id === poolId) ?? live[0];
  const swap = useMutation({
    mutationFn: (v: { pool: BankPool; tokenIn: BankToken; amount: number; minOut: number }) =>
      swapBank({ data: { poolId: v.pool.id, tokenIn: v.tokenIn, amount: v.amount, minOut: v.minOut, opId: crypto.randomUUID() } }),
    onSuccess: (r, v) => {
      toast.success(`${ru ? "Получено" : "Received"} ${fmtNum(r.out, ru)} ${tokenLabel(v.tokenIn === v.pool.tokenA ? v.pool.tokenB : v.pool.tokenA, ru)}`);
      setAmount("");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
    onSettled: () => {
      for (const key of [BANK_POOLS_KEY, BANK_LICENSE_KEY, ACC_BALANCES_KEY, RESOURCES_KEY]) void qc.invalidateQueries({ queryKey: key });
    },
  });
  if (!pool) return null;

  const inTok = tokenIn === pool.tokenA || tokenIn === pool.tokenB ? tokenIn : pool.tokenA;
  const outTok = inTok === pool.tokenA ? pool.tokenB : pool.tokenA;
  const value = Number(amount.replace(",", ".").trim());
  const q = Number.isFinite(value) && value > 0 ? quote(pool, inTok, value) : null;
  const balance = inTok === "Darai" ? (lic.data?.darai ?? 0) : (res.data?.[inTok] ?? 0);
  const sell = isSellGold(pool, inTok);
  const license = lic.data?.license ?? null;
  const left = sell && license && licenseActive(license) ? Math.max(0, license.dailyLimit - (lic.data?.soldGold24h ?? 0)) : null;
  const blocked = sell && (left === null ? (ru ? "Нужна лицензия на продажу золота" : "A gold selling license is required") : value > left ? (ru ? "Больше суточного лимита лицензии" : "Over the license daily limit") : null);
  const short = value > balance;
  const price = (n: number) => `1 ${tokenLabel(pool.tokenA, ru)} = ${fmtNum(n, ru)} ${tokenLabel(pool.tokenB, ru)}`;

  return (
    <section className="auction-ledger space-y-3" aria-labelledby="bank-exchange-title">
      <h2 id="bank-exchange-title" className="font-['Auction_Russo'] text-lg text-[#fff0c7]">
        {ru ? "Обмен" : "Exchange"}
      </h2>
      {live.length > 1 && (
        <select aria-label={ru ? "Пул" : "Pool"} className="auction-field w-full" value={pool.id} onChange={(e) => { setPoolId(e.target.value); setTokenIn(null); }}>
          {live.map((p) => (
            <option key={p.id} value={p.id}>
              {tokenLabel(p.tokenA, ru)} ⇄ {tokenLabel(p.tokenB, ru)}
            </option>
          ))}
        </select>
      )}
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-sm text-[#cdb791]">{ru ? "Отдаю" : "Give"}</span>
        <input className="auction-field flex-1" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <b className="w-20 shrink-0 text-right text-[#fff0c7]">{tokenLabel(inTok, ru)}</b>
      </div>
      <div className="flex items-center justify-between text-xs text-[#a59c8c]">
        <button type="button" className="underline" onClick={() => setAmount(String(Math.floor(balance)))}>
          {ru ? "есть" : "have"} {fmtNum(balance, ru)}
        </button>
        <button type="button" className="auction-secondary !min-h-9 !px-3" aria-label={ru ? "Поменять направление" : "Flip direction"} onClick={() => { setTokenIn(outTok); setAmount(""); }}>
          <ArrowDownUp className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-sm text-[#cdb791]">{ru ? "Получу" : "Get"}</span>
        <b className="flex-1 text-lg text-[#fff0c7]">{q ? fmtNum(q.out, ru) : "—"}</b>
        <b className="w-20 shrink-0 text-right text-[#fff0c7]">{tokenLabel(outTok, ru)}</b>
      </div>
      {q && (
        <div className="space-y-1 rounded-xl border border-[#ffffff1f] bg-[#0d1b2b] p-3 text-sm text-[#d8ccb5]">
          <p>
            {ru ? "Комиссия" : "Fee"} {pool.feePct} %: {fmtNum(q.fee, ru)} {tokenLabel(inTok, ru)} — {ru ? "в пул" : "to pool"} {fmtNum(q.feePool, ru)}, {ru ? "в пул карты" : "to map pool"} {fmtNum(q.feeMap, ru)}
          </p>
          <p>{ru ? "Цена до" : "Price before"}: {price(q.priceBefore)}</p>
          <p>{ru ? "Цена после" : "Price after"}: {price(q.priceAfter)}</p>
          <p>{ru ? "Сдвиг цены сделки" : "Price impact"}: {fmtNum(Math.round(q.impactPct * 100) / 100, ru)} %</p>
        </div>
      )}
      {sell && (
        <p className="text-sm text-[#b9a885]">
          {left === null
            ? ru ? "Лицензии нет" : "No license"
            : `${ru ? "Лицензия: можно продать ещё" : "License: can still sell"} ${fmtNum(left, ru)} ${ru ? "золота за сутки" : "gold today"}`}
        </p>
      )}
      {(blocked || (q && short)) && (
        <p className="text-sm text-[#e9b9a5]" role="alert">{blocked || (ru ? "Не хватает на счёте" : "Not enough on account")}</p>
      )}
      <button
        type="button"
        className="auction-primary w-full"
        disabled={!q || short || !!blocked || swap.isPending}
        onClick={() => q && swap.mutate({ pool, tokenIn: inTok, amount: value, minOut: Math.floor(q.out * 0.99 * 1e4) / 1e4 })}
      >
        {swap.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {ru ? "Обменять" : "Exchange"}
      </button>
    </section>
  );
}
