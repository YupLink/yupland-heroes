// Под формой вывода DARAI: как разложится сумма, если на счёте есть DARAI из
// NFT-холдеров (ПРАВИЛА §8.51) — обычные уходят сразу, холдерские последними,
// через 7 или 30 дней и за 5 %. Метки нет — ничего не показываем.
import { useQuery } from "@tanstack/react-query";
import { getMyHolderDarai } from "@/server/api/bank/bank-stake";
import { holderWithdrawSplit } from "@/lib/bankStake";
import { useLang } from "@/lib/i18n";

import { HOLDER_TAG_KEY } from "@/lib/holderTagKey";
export { HOLDER_TAG_KEY };

export function HolderWithdrawNote({ amount, balance }: { amount: number; balance: number }) {
  const ru = useLang() === "ru";
  const q = useQuery({ queryKey: HOLDER_TAG_KEY, queryFn: () => getMyHolderDarai() });
  const tag = q.data?.tag;
  if (!tag || tag.d7 + tag.d30 <= 0) return null;
  const n = (v: number) => v.toLocaleString(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 2 });
  const split =
    amount > 0 && amount <= balance ? holderWithdrawSplit(amount, balance, tag.d7, tag.d30) : null;
  return (
    <div className="space-y-1 rounded-lg border border-amber-400/40 bg-amber-400/5 p-2.5 text-[11px] text-amber-200">
      <p>
        {ru ? "DARAI из NFT-холдеров на счёте" : "DARAI from holder NFTs on account"}:{" "}
        {n(tag.d7 + tag.d30)} ·{" "}
        {ru
          ? "выводятся последними, через 7–30 дней, комиссия 5 %"
          : "go out last, after 7–30 days, 5 % fee"}
      </p>
      {split && split.parts.length > 0 && (
        <p>
          {ru ? "Сразу" : "Now"}: {n(split.plain)}
          {split.parts.map((p) => (
            <span key={p.days}>
              {" · "}
              {ru ? `через ${p.days} дн` : `in ${p.days} d`}: {n(p.payout)} (
              {ru ? "комиссия" : "fee"} {n(p.fee)})
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
