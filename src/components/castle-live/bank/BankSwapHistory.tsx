// История обменов пула (админ): от новых к старым, по 30, «Ещё» — следующая порция.
// Строка: время, @ник (у откупа золота — «Откуп банка»), отдал → получил, комиссия
// (в пул / в пул карты).
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { listBankSwapHistory, type BankSwapItem } from "@/server/api/bank/bank-stats";
import { tokenLabel } from "@/lib/castleBank";
import { BANK_STATS_KEY } from "./bankKeys";
import { fmtStat, fmtWhen } from "./bankStatsFmt";

type Page = { items: BankSwapItem[]; next: string | null };

function Item({ s, ru }: { s: BankSwapItem; ru: boolean }) {
  return (
    <li className="auction-lot">
      <p className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="auction-lot__title truncate text-sm">
          {s.buyback ? <span className="auction-kind">{ru ? "Откуп банка" : "Bank buyback"}</span> : (s.who ?? "—")}
        </span>
        <span className="text-xs text-[#a59c8c] tabular-nums">{fmtWhen(s.at, ru)}</span>
      </p>
      <p className="mt-1 text-sm tabular-nums text-[#f5ecda]">
        {ru ? "отдал" : "gave"} <b>{fmtStat(s.amountIn, ru)}</b> {tokenLabel(s.tokenIn, ru)} → {ru ? "получил" : "got"}{" "}
        <b className="text-[#ffd773]">{fmtStat(s.amountOut, ru)}</b> {tokenLabel(s.tokenOut, ru)}
      </p>
      <p className="auction-lot__meta tabular-nums">
        {ru ? "комиссия" : "fee"} {fmtStat(s.feePool + s.feeMap, ru)} {tokenLabel(s.tokenIn, ru)} · {ru ? "в пул" : "to pool"}{" "}
        {fmtStat(s.feePool, ru)} · {ru ? "в пул карты" : "to map pool"} {fmtStat(s.feeMap, ru)}
      </p>
    </li>
  );
}

export function BankSwapHistory({ poolId, ru }: { poolId: string; ru: boolean }) {
  const q = useInfiniteQuery({
    queryKey: [...BANK_STATS_KEY, "history", poolId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => listBankSwapHistory({ data: { poolId, cursor: pageParam } }),
    getNextPageParam: (last: Page) => last.next ?? undefined,
    staleTime: 30_000,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section className="auction-ledger" aria-label={ru ? "История обменов" : "Swap history"}>
      <h3 className="mb-1 font-['Auction_Russo'] text-base text-[#fff0c7]">{ru ? "История обменов" : "Swap history"}</h3>
      {q.isPending ? (
        <p role="status" className="auction-loading">
          <Loader2 className="h-5 w-5 animate-spin" />
        </p>
      ) : q.isError ? (
        <p role="alert" className="text-sm text-[#f0b4ab]">
          {q.error instanceof Error ? q.error.message : String(q.error)}
        </p>
      ) : items.length ? (
        <>
          <ul>
            {items.map((s) => (
              <Item key={s.id} s={s} ru={ru} />
            ))}
          </ul>
          {q.hasNextPage && (
            <button
              type="button"
              className="auction-secondary mt-2 w-full"
              disabled={q.isFetchingNextPage}
              onClick={() => void q.fetchNextPage()}
            >
              {q.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
              {ru ? "Ещё" : "More"}
            </button>
          )}
        </>
      ) : (
        <p className="auction-empty">{ru ? "Обменов не было" : "No swaps yet"}</p>
      )}
    </section>
  );
}
