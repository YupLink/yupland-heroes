// Вклады стейкинга и DARAI холдеров на счёте (ПРАВИЛА §8.51). Снять — двумя
// нажатиями: «Забрать раньше срока» (в локе) открывает подтверждение «будет списано
// N золота (половина начисленного), вернётся M DARAI»; сервер берёт не больше
// показанного (confirmGold), сначала золото, потом DARAI. Без лока золото не берётся.
// Выводы DARAI холдеров, ждущие срок; свой вывод игрок может отменить.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cancelHolderWithdraw, closeBankStake, type getBankStake } from "@/server/api/bank/bank-stake";
import { earlyBack, stakeHeld, stakeLocked, stakePlan, type MyStake } from "@/lib/bankStake";
import { fmtNum } from "./bankUi";
import { refreshBank } from "./bankKeys";

type Data = Awaited<ReturnType<typeof getBankStake>>;

export function BankStakeList({ ru, data }: { ru: boolean; data: Data }) {
  const qc = useQueryClient();
  const [asking, setAsking] = useState<string | null>(null);
  const loc = ru ? "ru-RU" : "en-US";
  const date = (s: string) => new Date(s).toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" });
  const mln = (n: number) => (n >= 1e6 ? `${(n / 1e6).toLocaleString(loc, { maximumFractionDigits: 2 })} ${ru ? "млн" : "M"}` : fmtNum(n, ru));
  const refresh = () => void refreshBank(qc);
  const close = useMutation({
    mutationFn: (v: { id: string; gold: number }) =>
      closeBankStake({ data: { stakeId: v.id, confirmGold: v.gold } }),
    onSuccess: (r) =>
      toast.success(
        r.goldBack > 0
          ? ru
            ? `Списано ${fmtNum(r.goldBack, ru)} золота, вернулось ${mln(r.darai)} DARAI`
            : `${fmtNum(r.goldBack, ru)} gold taken, ${mln(r.darai)} DARAI returned`
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
    // Вклад NFT-холдера до срока не снять вовсе (§8.51 п. 3): дата вместо кнопки.
    const held = stakeHeld(s);
    const back = locked ? earlyBack(s.goldPaid) : 0;
    const forecast = plan && plan.days > 0 ? s.goldDay * plan.days : null;
    return <li key={s.id} className="bank-player__owned">
      <div className="bank-player__owned-top">
        <div><strong>{mln(s.amount)} DARAI</strong><small>{s.lockUntil ? `${ru ? plan?.ru : plan?.en} · ${s.pct}% ${ru ? "годовых" : "annual"}` : `${ru ? "Без лока" : "No lock"} · ${s.pct}%`}{s.holder > 0 ? (ru ? " · холдер" : " · holder") : ""}</small></div>
        <span>{held && s.holdUntil ? `${ru ? "До" : "Until"} ${date(s.holdUntil)}` : s.lockUntil ? `${ru ? "До" : "Until"} ${date(s.lockUntil)}` : ru ? "Снять можно сейчас" : "Available now"}</span>
      </div>
      <div className="bank-player__owned-bottom">
        <dl><dt>{ru ? "Уже начислено" : "Earned so far"}</dt><dd>{fmtNum(s.goldPaid, ru)} {ru ? "золота" : "gold"}</dd></dl>
        <dl><dt>{forecast !== null ? (ru ? "Прогноз за весь срок" : "Term forecast") : (ru ? "В сутки" : "Per day")}</dt><dd>{fmtNum(forecast ?? s.goldDay, ru)} {ru ? "золота" : "gold"}</dd></dl>
        <button type="button" className="bank-player__withdraw" disabled={held} onClick={() => setAsking(s.id)}>{ru ? "Снять" : "Withdraw"}</button>
      </div>
      {asking === s.id && <div className="bank-player__stake-confirm" role="alertdialog" aria-labelledby={`stake-ask-${s.id}`}>
        <p id={`stake-ask-${s.id}`}>{back > 0
          ? ru ? <>При досрочном снятии спишется <b>{fmtNum(back, ru)} золота</b> (половина начисленного). Вернётся <b>{mln(s.amount)} DARAI</b>.</>
            : <>Early withdrawal takes <b>{fmtNum(back, ru)} gold</b> (half of earned gold). <b>{mln(s.amount)} DARAI</b> returns.</>
          : ru ? <>Вернётся <b>{mln(s.amount)} DARAI</b>.</> : <><b>{mln(s.amount)} DARAI</b> returns.</>}</p>
        <div><button type="button" onClick={() => setAsking(null)} disabled={close.isPending}>{ru ? "Отмена" : "Cancel"}</button>
        <button type="button" onClick={() => close.mutate({ id: s.id, gold: back })} disabled={close.isPending}>{close.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{ru ? "Подтвердить" : "Confirm"}</button></div>
      </div>}
    </li>;
  };

  const tagged = data.tag.d7 + data.tag.d30;
  return (
    <>
      <div className="bank-player__owned-section"><div className="bank-player__section-head"><h3>{ru ? "Мои вклады" : "My deposits"}</h3><small>{data.stakes.length} {ru ? "вкладов" : "deposits"}</small></div>
      {data.stakes.length > 0 ? <ul>{data.stakes.map(row)}</ul> : <p className="bank-player__empty">{ru ? "Пока нет вкладов" : "No deposits yet"}</p>}</div>
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
