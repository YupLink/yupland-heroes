// Правка пула (только админ; владелец 29.10.2026: «есть ли там веса — введи и дай
// возможность вводить, и какая комса»). Комиссия — всегда, тем же списком, что при
// создании; курс «N единиц A = M единиц B» — только у пустого пула: у наполненного
// цену задают запасы, поля курса нет. Уходит только изменённое; после — список пулов,
// график курса и статистика перечитываются сразу, без перезагрузки.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { updateBankPool } from "@/server/api/bank/bank-pools";
import { BANK_FEES, tokenLabel, type BankPool, type BankToken } from "@/lib/castleBank";
import { BANK_POOLS_KEY, BANK_RATE_KEY, BANK_STATS_KEY } from "./bankKeys";
import { POOL_FIELD, parseWeight } from "./bankPoolInput";
import { poolRateText } from "./bankPoolRate";

export function BankPoolEdit({ pool, ru, onDone }: { pool: BankPool; ru: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const empty = pool.reserveA === 0 && pool.reserveB === 0;
  const [fee, setFee] = useState<number>(pool.feePct);
  const [wa, setWa] = useState(String(pool.weightA));
  const [wb, setWb] = useState(String(pool.weightB));
  const na = parseWeight(wa);
  const nb = parseWeight(wb);
  const rateOk = !Number.isNaN(na) && !Number.isNaN(nb);
  const feeChanged = fee !== pool.feePct;
  const rateChanged = empty && rateOk && (na !== pool.weightA || nb !== pool.weightB);
  const save = useMutation({
    mutationFn: () =>
      updateBankPool({
        data: {
          id: pool.id,
          ...(feeChanged ? { feePct: fee } : {}),
          ...(rateChanged ? { weightA: na, weightB: nb } : {}),
        },
      }),
    onSuccess: () => {
      toast.success(ru ? "Пул изменён" : "Pool updated");
      onDone();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
    onSettled: () => {
      for (const key of [BANK_POOLS_KEY, BANK_RATE_KEY, BANK_STATS_KEY]) void qc.invalidateQueries({ queryKey: key });
    },
  });
  const ready = (feeChanged || rateChanged) && (!empty || rateOk) && !save.isPending;
  const weightRow = (value: string, set: (v: string) => void, t: BankToken, label: string) => (
    <div className="flex items-center gap-2">
      <input aria-label={label} inputMode="decimal" placeholder="0" className={`${POOL_FIELD} w-28`} value={value} onChange={(e) => set(e.target.value)} />
      <span className="min-w-0 flex-1 truncate text-sm text-[#cdb791]">{tokenLabel(t, ru)}</span>
    </div>
  );

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-[#ffffff1f] bg-[#0d1b2b] p-3">
      {empty && (
        <>
          {weightRow(wa, setWa, pool.tokenA, ru ? "Сколько первого" : "Amount of first")}
          <div className="text-center text-[#bd9865]">=</div>
          {weightRow(wb, setWb, pool.tokenB, ru ? "Сколько второго" : "Amount of second")}
          {rateOk && (
            <p className="text-sm text-[#d8ccb5]" role="status">
              {poolRateText({ ...pool, weightA: na, weightB: nb }, ru)}
            </p>
          )}
        </>
      )}
      <label className="flex items-center gap-2 text-sm">
        <span className="flex-1">{ru ? "Комиссия" : "Fee"}</span>
        <select className={`${POOL_FIELD} w-28`} value={fee} onChange={(e) => setFee(Number(e.target.value))}>
          {BANK_FEES.map((f) => (
            <option key={f} value={f}>
              {f} %
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <button type="button" className="auction-secondary flex-1" onClick={onDone}>
          {ru ? "Отмена" : "Cancel"}
        </button>
        <button type="button" className="auction-primary flex-1" disabled={!ready} onClick={() => save.mutate()}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {ru ? "Сохранить" : "Save"}
        </button>
      </div>
    </div>
  );
}
