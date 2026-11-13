// Стейкинг банка (открыт игрокам 20.10.2026, ПРАВИЛА §8.51): выбор срока (% годовых),
// сумма DARAI, сколько золота в сутки и за срок; ниже — вклады и DARAI холдеров.
// Числа — lib/bankStake.ts (та же формула пишется во вклад на сервере).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getBankStake, openBankStake } from "@/server/api/bank/bank-stake";
import { STAKE_PLANS, goldPerDay, stakePlan, type StakePlanId } from "@/lib/bankStake";
import { fmtNum } from "./bankUi";
import { BANK_STAKE_KEY, refreshBank } from "./bankKeys";
import { BankStakeList } from "./BankStakeList";

export function BankStake({ ru }: { ru: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: BANK_STAKE_KEY, queryFn: () => getBankStake() });
  const [plan, setPlan] = useState<StakePlanId>("free");
  const [amount, setAmount] = useState("");
  const open = useMutation({
    mutationFn: (v: { amount: number; plan: StakePlanId }) => openBankStake({ data: { ...v, opId: crypto.randomUUID() } }),
    onSuccess: () => {
      toast.success(ru ? "DARAI в стейкинге" : "DARAI staked");
      setAmount("");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
    onSettled: () => void refreshBank(qc),
  });

  const p = stakePlan(plan)!;
  const darai = q.data?.darai ?? 0;
  const value = Number(amount.replace(",", ".").trim());
  const ok = Number.isFinite(value) && value > 0 && value <= darai;
  const day = ok ? goldPerDay(value, p.pct) : 0;

  return (
    <section className="bank-player__panel bank-player__stakes" aria-labelledby="bank-stake-title">
      <h2 id="bank-stake-title">{ru ? "Новый вклад" : "New deposit"}</h2>
      <label className="bank-player__field-label" htmlFor="bank-stake-amount">{ru ? "Сумма DARAI" : "DARAI amount"}</label>
      <div className="bank-player__field">
        <span className="bank-player__stake-input-icon bank-player__money-icon bank-player__money-icon--darai" aria-hidden="true" />
        <input id="bank-stake-amount" inputMode="decimal" placeholder={ru ? "Введите сумму" : "Enter amount"} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button type="button" onClick={() => setAmount(String(darai))}>{ru ? "Макс" : "Max"}</button>
      </div>
      <p className="bank-player__balance">{ru ? "В наличии" : "Available"}: {fmtNum(darai, ru)} DARAI</p>
      {Number.isFinite(value) && value > darai && <p className="bank-player__error" role="alert">{ru ? "Недостаточно DARAI" : "Insufficient DARAI"}</p>}
      <div className="bank-player__section-head"><h3>{ru ? "Срок и ставка" : "Term and rate"}</h3><small>{ru ? "Годовых" : "Annual"}</small></div>
      <div className="bank-player__plans" role="group" aria-label={ru ? "Срок вклада" : "Deposit term"}>
        {STAKE_PLANS.map((x) => <button key={x.id} type="button" aria-pressed={plan === x.id} onClick={() => setPlan(x.id)}>
          <span>{ru ? x.ru : x.en}</span><strong>{x.pct}%</strong><i aria-hidden="true">{plan === x.id ? "✓" : ""}</i>
        </button>)}
      </div>
      <div className="bank-player__yield">
        <h3>{ru ? "Доход золотом" : "Gold earnings"}</h3>
        <dl><dt>{ru ? "В сутки" : "Per day"}</dt><dd>{ok ? fmtNum(day, ru) : "—"}</dd>
        {p.days > 0 && <><dt>{ru ? "Оценка за срок" : "Estimated term"}</dt>
        <dd>{ok ? fmtNum(Math.round(day * p.days * 100) / 100, ru) : "—"}</dd></>}</dl>
      </div>
      <button type="button" className="bank-player__primary" disabled={!ok || open.isPending} onClick={() => open.mutate({ amount: value, plan })}>
        {open.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{ru ? "Вложить" : "Deposit"}
      </button>
      {q.data && <BankStakeList ru={ru} data={q.data} />}
      {q.isError && <p role="alert">{q.error instanceof Error ? q.error.message : String(q.error)}</p>}
    </section>
  );
}
