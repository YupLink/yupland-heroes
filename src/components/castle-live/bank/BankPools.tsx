// Пулы банка (только админ): пары с курсом (по запасам, пул пуст — стартовый) и
// комиссией, запас, «Пополнить» и форма нового пула. Пустой пул можно удалить.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { deleteBankPool, listBankPools } from "@/server/api/bank/bank-pools";
import { tokenLabel, type BankPool } from "@/lib/castleBank";
import { poolPrice } from "@/lib/bankSwap";
import { BankPoolForm } from "./BankPoolForm";
import { BankFund } from "./BankFund";
import { BANK_POOLS_KEY, TokenBadge, fmtNum } from "./bankUi";

function PoolRow({ pool, ru }: { pool: BankPool; ru: boolean }) {
  const qc = useQueryClient();
  const empty = pool.reserveA === 0 && pool.reserveB === 0;
  const [funding, setFunding] = useState(false);
  const del = useMutation({
    mutationFn: () => deleteBankPool({ data: { id: pool.id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: BANK_POOLS_KEY }),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  return (
    <li className="border-b border-[#ffffff14] py-3 last:border-0">
     <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <TokenBadge token={pool.tokenA} ru={ru} />
          <span className="text-[#bd9865]">⇄</span>
          <TokenBadge token={pool.tokenB} ru={ru} />
        </div>
        <p className="text-sm text-[#d8ccb5]">
          1 {tokenLabel(pool.tokenA, ru)} = {fmtNum(poolPrice(pool), ru)} {tokenLabel(pool.tokenB, ru)}
          {" · "}
          {ru ? "комиссия" : "fee"} {pool.feePct} %
        </p>
        <p className="text-xs text-[#a59c8c]">
          {ru ? "Запас" : "Reserve"}: {fmtNum(pool.reserveA, ru)} / {fmtNum(pool.reserveB, ru)}
        </p>
      </div>
      {empty && (
        <button
          type="button"
          data-game-button="icon"
          aria-label={ru ? "Удалить пул" : "Delete pool"}
          className="grid h-10 w-10 place-items-center rounded-full border border-[#94703c] text-[#e9b9a5]"
          disabled={del.isPending}
          onClick={() => del.mutate()}
        >
          {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      )}
      {!funding && (
        <button type="button" className="auction-secondary" onClick={() => setFunding(true)}>
          {ru ? "Пополнить" : "Fund"}
        </button>
      )}
     </div>
      {funding && <BankFund pool={pool} ru={ru} onDone={() => setFunding(false)} />}
    </li>
  );
}

export function BankPools({ ru }: { ru: boolean }) {
  const q = useQuery({ queryKey: BANK_POOLS_KEY, queryFn: () => listBankPools() });
  return (
    <>
      <section className="auction-ledger" aria-labelledby="bank-pools-title">
        <h2 id="bank-pools-title" className="mb-1 font-['Auction_Russo'] text-lg text-[#fff0c7]">
          {ru ? "Пулы" : "Pools"}
        </h2>
        {q.isPending ? (
          <p role="status">{ru ? "Загрузка…" : "Loading…"}</p>
        ) : q.isError ? (
          <p role="alert">{q.error instanceof Error ? q.error.message : String(q.error)}</p>
        ) : q.data.length ? (
          <ul>
            {q.data.map((p) => (
              <PoolRow key={p.id} pool={p} ru={ru} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[#a59c8c]">{ru ? "Пулов нет" : "No pools"}</p>
        )}
      </section>
      <BankPoolForm ru={ru} pools={q.data ?? []} />
    </>
  );
}
