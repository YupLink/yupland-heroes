// Новый пул банка (только админ): пара ресурсов и стартовый курс «N единиц A = M
// единиц B», комиссия из списка. Запаса нет — наполнение позже. DARAI — только
// с золотом: в списке второй стороны лишнего просто нет.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { createBankPool } from "@/server/api/bank/bank-pools";
import {
  BANK_DEFAULT_FEE,
  BANK_FEES,
  BANK_TOKENS,
  pairProblem,
  tokenLabel,
  type BankPool,
  type BankToken,
} from "@/lib/castleBank";
import { BANK_POOLS_KEY, fmtNum } from "./bankUi";

const field =
  "min-h-11 rounded-lg border border-[#94703c] bg-[#0b1726] px-2 text-[#f5ecda] outline-none focus:border-[#edc36b]";

const parse = (s: string): number => {
  const n = Number(s.replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? n : NaN;
};

/** Что можно поставить второй стороной к выбранной первой. */
const partners = (a: BankToken): BankToken[] => BANK_TOKENS.filter((t) => pairProblem(a, t) === null);

export function BankPoolForm({ ru, pools }: { ru: boolean; pools: BankPool[] }) {
  const qc = useQueryClient();
  const [a, setA] = useState<BankToken>("gold");
  const [b, setB] = useState<BankToken>("Darai");
  const [wa, setWa] = useState("1");
  const [wb, setWb] = useState("");
  const [fee, setFee] = useState<number>(BANK_DEFAULT_FEE);
  const na = parse(wa);
  const nb = parse(wb);
  const taken = pools.some(
    (p) => (p.tokenA === a && p.tokenB === b) || (p.tokenA === b && p.tokenB === a),
  );
  const pickA = (t: BankToken) => {
    setA(t);
    if (pairProblem(t, b) !== null) setB(partners(t)[0]);
  };
  const create = useMutation({
    mutationFn: () =>
      createBankPool({ data: { tokenA: a, tokenB: b, weightA: na, weightB: nb, feePct: fee } }),
    onSuccess: () => {
      toast.success(ru ? "Пул создан" : "Pool created");
      setWb("");
      void qc.invalidateQueries({ queryKey: BANK_POOLS_KEY });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const ready = !Number.isNaN(na) && !Number.isNaN(nb) && !taken && !create.isPending;
  const select = (value: BankToken, options: BankToken[], onPick: (t: BankToken) => void, label: string) => (
    <select aria-label={label} className={`${field} flex-1`} value={value} onChange={(e) => onPick(e.target.value as BankToken)}>
      {options.map((t) => (
        <option key={t} value={t}>
          {tokenLabel(t, ru)}
        </option>
      ))}
    </select>
  );

  return (
    <section className="auction-ledger space-y-3" aria-labelledby="bank-new-pool">
      <h2 id="bank-new-pool" className="font-['Auction_Russo'] text-lg text-[#fff0c7]">
        {ru ? "Новый пул" : "New pool"}
      </h2>
      <div className="flex items-center gap-2">
        <input aria-label={ru ? "Сколько первого" : "Amount of first"} inputMode="decimal" className={`${field} w-24`} value={wa} onChange={(e) => setWa(e.target.value)} />
        {select(a, [...BANK_TOKENS], pickA, ru ? "Первый ресурс" : "First resource")}
      </div>
      <div className="text-center text-[#bd9865]">=</div>
      <div className="flex items-center gap-2">
        <input aria-label={ru ? "Сколько второго" : "Amount of second"} inputMode="decimal" placeholder="0" className={`${field} w-24`} value={wb} onChange={(e) => setWb(e.target.value)} />
        {select(b, partners(a), setB, ru ? "Второй ресурс" : "Second resource")}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <span className="flex-1">{ru ? "Комиссия" : "Fee"}</span>
        <select className={`${field} w-28`} value={fee} onChange={(e) => setFee(Number(e.target.value))}>
          {BANK_FEES.map((f) => (
            <option key={f} value={f}>
              {f} %
            </option>
          ))}
        </select>
      </label>
      {!Number.isNaN(na) && !Number.isNaN(nb) && (
        <p className="text-sm text-[#d8ccb5]" role="status">
          1 {tokenLabel(a, ru)} = {fmtNum(nb / na, ru)} {tokenLabel(b, ru)} · 1 {tokenLabel(b, ru)} ={" "}
          {fmtNum(na / nb, ru)} {tokenLabel(a, ru)}
        </p>
      )}
      {taken && <p className="text-sm text-[#e9b9a5]" role="alert">{ru ? "Пул на эту пару уже есть" : "This pair already has a pool"}</p>}
      <button
        type="button"
        data-game-button="primary"
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl"
        disabled={!ready}
        onClick={() => create.mutate()}
      >
        {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {ru ? "Создать пул" : "Create pool"}
      </button>
    </section>
  );
}
