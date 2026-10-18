// Вклады стейкинга и DARAI холдеров на счёте (ПРАВИЛА §8.51). Снять — двумя
// нажатиями: в локе раньше срока подтверждение называет, сколько золота вернуть
// (половина начисленного). Выводы DARAI холдеров, ждущие срок, — с отменой.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Coins, Gem, Loader2 } from "lucide-react";
import { cancelHolderWithdraw, closeBankStake, type getBankStake } from "@/server/api/bank/bank-stake";
import { earlyBack, stakeLocked, stakePlan, type MyStake } from "@/lib/bankStake";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { fmtNum } from "./bankUi";
import { BANK_LICENSE_KEY } from "./BankLicenses";

type Data = Awaited<ReturnType<typeof getBankStake>>;
const STAKE_KEY = ["bank-stake"] as const;

export function BankStakeList({ ru, data }: { ru: boolean; data: Data }) {
  const qc = useQueryClient();
  const [asking, setAsking] = useState<string | null>(null);
  const loc = ru ? "ru-RU" : "en-US";
  const date = (s: string) => new Date(s).toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" });
  const mln = (n: number) => (n >= 1e6 ? `${(n / 1e6).toLocaleString(loc, { maximumFractionDigits: 2 })} ${ru ? "млн" : "M"}` : fmtNum(n, ru));
  const refresh = () => {
    for (const key of [STAKE_KEY, BANK_LICENSE_KEY, ACC_BALANCES_KEY, RESOURCES_KEY]) void qc.invalidateQueries({ queryKey: key });
  };
  const close = useMutation({
    mutationFn: (id: string) => closeBankStake({ data: { stakeId: id } }),
    onSuccess: (r) =>
      toast.success(
        r.goldBack > 0
          ? `${ru ? "Снято" : "Unstaked"} ${mln(r.darai)} DARAI, ${ru ? "возвращено золота" : "gold returned"} ${fmtNum(r.goldBack, ru)}`
          : `${ru ? "Снято" : "Unstaked"} ${mln(r.darai)} DARAI`,
      ),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
    onSettled: () => {
      setAsking(null);
      refresh();
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelHolderWithdraw({ data: { holdId: id } }),
    onSuccess: () => toast.success(ru ? "Вывод отменён, DARAI на счёте" : "Withdrawal cancelled, DARAI back"),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
    onSettled: refresh,
  });

  const row = (s: MyStake) => {
    const plan = stakePlan(s.plan);
    const locked = stakeLocked(s);
    const back = locked ? earlyBack(s.goldPaid) : 0;
    return (
      <li key={s.id} className="auction-lot">
        <div className="auction-lot__top">
          <span className="auction-lot__media auction-rarity--rare" aria-hidden="true">
            {s.source === "holder" ? <Gem /> : <Coins />}
          </span>
          <div className="auction-lot__info">
            <p className="auction-lot__title flex flex-wrap items-center gap-2">
              {mln(s.amount)} DARAI
              {s.holder > 0 && <span className="auction-kind">{ru ? "холдер" : "holder"}</span>}
            </p>
            <p className="auction-lot__meta">
              {s.pct} % · {fmtNum(s.goldDay, ru)} {ru ? "золота в сутки" : "gold a day"} · {ru ? "начислено" : "earned"} {fmtNum(s.goldPaid, ru)}
            </p>
            <p className="auction-lot__meta">
              {s.lockUntil ? `${ru ? plan?.ru : plan?.en} · ${ru ? "до" : "until"} ${date(s.lockUntil)}` : ru ? "Без лока" : "No lock"}
            </p>
          </div>
        </div>
        {asking === s.id ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="flex-1 text-sm text-[#fbeccb]">
              {back > 0
                ? ru ? <>Вернуть <b>{fmtNum(back, ru)}</b> золота и снять?</> : <>Return <b>{fmtNum(back, ru)}</b> gold and unstake?</>
                : ru ? <>Снять <b>{mln(s.amount)}</b> DARAI?</> : <>Unstake <b>{mln(s.amount)}</b> DARAI?</>}
            </p>
            <button type="button" className="auction-secondary" onClick={() => setAsking(null)}>
              {ru ? "Отмена" : "Cancel"}
            </button>
            <button type="button" className="auction-primary" disabled={close.isPending} onClick={() => close.mutate(s.id)}>
              {close.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {ru ? "Снять" : "Unstake"}
            </button>
          </div>
        ) : (
          <button type="button" className="auction-secondary mt-3 w-full" onClick={() => setAsking(s.id)}>
            {ru ? "Снять" : "Unstake"}
          </button>
        )}
      </li>
    );
  };

  const tagged = data.tag.d7 + data.tag.d30;
  return (
    <>
      {data.stakes.length > 0 && <ul>{data.stakes.map(row)}</ul>}
      {tagged > 0 && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[#b9a885]">
          <span>{ru ? "DARAI холдеров на счёте" : "Holder DARAI on account"}:</span>
          {data.tag.d7 > 0 && <b className="text-[#fff0c7]">{mln(data.tag.d7)} · {ru ? "вывод 7 дн" : "exit 7 d"}</b>}
          {data.tag.d30 > 0 && <b className="text-[#fff0c7]">{mln(data.tag.d30)} · {ru ? "вывод 30 дн" : "exit 30 d"}</b>}
        </p>
      )}
      {data.holds.map((h) => (
        <div key={h.id} className="flex items-center gap-2 rounded-xl border border-[#ffffff1f] bg-[#0d1b2b] p-3 text-sm text-[#d8ccb5]">
          <p className="flex-1">
            {ru ? "Вывод" : "Withdrawal"} <b className="text-[#fff0c7]">{mln(h.payout)} DARAI</b> · {date(h.releaseAt)} · {ru ? "комиссия" : "fee"} {mln(h.fee)}
          </p>
          <button type="button" className="auction-secondary !min-h-9 !px-3" disabled={cancel.isPending} onClick={() => cancel.mutate(h.id)}>
            {ru ? "Отменить" : "Cancel"}
          </button>
        </div>
      ))}
    </>
  );
}
