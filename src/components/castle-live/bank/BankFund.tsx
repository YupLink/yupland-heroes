// Наполнение пула (админ): сколько положить первой стороны — вторую сервер считает
// сам (пул пуст — по стартовому курсу, есть запас — в пропорции). DARAI — со счёта
// админа, ресурсы выпускает игра. Ждущий откуп золота проводится сразу после.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { fundBankPool } from "@/server/api/bank/bank-swap";
import { tokenLabel, type BankPool } from "@/lib/castleBank";
import { fundPair } from "@/lib/bankSwap";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";
import { BANK_POOLS_KEY, fmtNum } from "./bankUi";
import { BANK_LICENSE_KEY } from "./BankLicenses";

export function BankFund({ pool, ru, onDone }: { pool: BankPool; ru: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const [a, setA] = useState("");
  const amountA = Number(a.replace(",", ".").trim());
  const ok = Number.isFinite(amountA) && amountA > 0;
  const amountB = ok ? fundPair(pool, amountA) : 0;
  const fund = useMutation({
    mutationFn: () => fundBankPool({ data: { poolId: pool.id, amountA, opId: crypto.randomUUID() } }),
    onSuccess: () => {
      toast.success(ru ? "Пул пополнен" : "Pool funded");
      onDone();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
    onSettled: () => {
      for (const key of [BANK_POOLS_KEY, BANK_LICENSE_KEY, ACC_BALANCES_KEY]) void qc.invalidateQueries({ queryKey: key });
    },
  });
  const side = (t: BankPool["tokenA"]) =>
    `${tokenLabel(t, ru)}${t === "Darai" ? (ru ? " — со счёта" : " — from account") : ""}`;
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-[#ffffff1f] bg-[#0d1b2b] p-3">
      <label className="flex items-center gap-2 text-sm">
        <span className="w-28 shrink-0 text-[#cdb791]">{side(pool.tokenA)}</span>
        <input className="auction-field flex-1" inputMode="decimal" placeholder="0" value={a} onChange={(e) => setA(e.target.value)} />
      </label>
      <p className="flex items-center gap-2 text-sm">
        <span className="w-28 shrink-0 text-[#cdb791]">{side(pool.tokenB)}</span>
        <b className="text-[#fff0c7]">{ok ? fmtNum(amountB, ru) : "—"}</b>
      </p>
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
