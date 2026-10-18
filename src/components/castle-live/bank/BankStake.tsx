// Стейкинг банка (пока только админ, ПРАВИЛА §8.51): выбор срока (% годовых),
// сумма DARAI, сколько золота в сутки и за срок; ниже — вклады и DARAI холдеров.
// Числа — lib/bankStake.ts (та же формула пишется во вклад на сервере).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getBankStake, openBankStake } from "@/server/api/bank/bank-stake";
import { STAKE_PLANS, goldPerDay, stakePlan, type StakePlanId } from "@/lib/bankStake";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";
import { fmtNum } from "./bankUi";
import { BANK_LICENSE_KEY } from "./BankLicenses";
import { BankStakeList } from "./BankStakeList";

export const BANK_STAKE_KEY = ["bank-stake"] as const;

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
    onSettled: () => {
      for (const key of [BANK_STAKE_KEY, BANK_LICENSE_KEY, ACC_BALANCES_KEY]) void qc.invalidateQueries({ queryKey: key });
    },
  });

  const p = stakePlan(plan)!;
  const darai = q.data?.darai ?? 0;
  const value = Number(amount.replace(",", ".").trim());
  const ok = Number.isFinite(value) && value > 0 && value <= darai;
  const day = ok ? goldPerDay(value, p.pct) : 0;

  return (
    <section className="auction-ledger space-y-3" aria-labelledby="bank-stake-title">
      <h2 id="bank-stake-title" className="font-['Auction_Russo'] text-lg text-[#fff0c7]">
        {ru ? "Стейкинг" : "Staking"}
      </h2>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" aria-label={ru ? "Срок" : "Term"}>
        {STAKE_PLANS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="radio"
            aria-checked={plan === x.id}
            onClick={() => setPlan(x.id)}
            className={`rounded-xl border px-2 py-2 text-center ${plan === x.id ? "border-[#edc36b] bg-[#2a2414] text-[#fff0c7]" : "border-[#ffffff1f] bg-[#0d1b2b] text-[#cdb791]"}`}
          >
            <span className="block text-xs">{ru ? x.ru : x.en}</span>
            <b className="block text-base">{x.pct} %</b>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          className="auction-field flex-1"
          inputMode="decimal"
          placeholder="0"
          aria-label={ru ? "Сколько DARAI" : "DARAI amount"}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <b className="w-16 shrink-0 text-right text-[#fff0c7]">DARAI</b>
      </div>
      <button type="button" className="text-xs text-[#a59c8c] underline" onClick={() => setAmount(String(Math.floor(darai)))}>
        {ru ? "есть" : "have"} {fmtNum(darai, ru)}
      </button>
      {ok && (
        <p className="rounded-xl border border-[#ffffff1f] bg-[#0d1b2b] p-3 text-sm text-[#d8ccb5]">
          {ru ? "Золота в сутки" : "Gold a day"}: <b className="text-[#ffd773]">{fmtNum(day, ru)}</b>
          {" · "}
          {p.days > 0 ? (ru ? "за срок" : "per term") : ru ? "в месяц" : "a month"}:{" "}
          <b className="text-[#ffd773]">{fmtNum(Math.round(day * (p.days || 30) * 100) / 100, ru)}</b>
        </p>
      )}
      <button
        type="button"
        className="auction-primary w-full"
        disabled={!ok || open.isPending}
        onClick={() => open.mutate({ amount: value, plan })}
      >
        {open.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {ru ? "Вложить" : "Stake"}
      </button>
      {q.data && <BankStakeList ru={ru} data={q.data} />}
      {q.isError && <p role="alert">{q.error instanceof Error ? q.error.message : String(q.error)}</p>}
    </section>
  );
}
