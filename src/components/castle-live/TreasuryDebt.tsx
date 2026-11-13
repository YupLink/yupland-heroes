// Долг в Казне — сверху (владелец, 13.11.2026; ПРАВИЛА §8.129): сколько осталось,
// сколько отдано, «Отдать» золото — сколько игрок выберет. Долга нет — блока нет.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import { RESOURCES_KEY, useResources } from "@/lib/hooks/useResources";
import { getMyDebt, payDebt } from "@/server/api/debt/debt";

export const DEBT_KEY = ["my-debt"] as const;

export function TreasuryDebt() {
  const ru = useLang() === "ru";
  const qc = useQueryClient();
  const debt = useQuery({ queryKey: DEBT_KEY, queryFn: () => getMyDebt(), staleTime: 15_000 });
  const gold = useResources().data?.gold ?? 0;
  const [amount, setAmount] = useState("");
  const pay = useMutation({
    mutationFn: (n: number) => payDebt({ data: { amount: n, op: newOpId() } }),
    onSuccess: (r) => {
      setAmount("");
      toast.success(ru ? `Отдано ${fmt(r.taken, ru)} золота` : `Paid ${fmt(r.taken, ru)} gold`);
    },
    onError: (e: Error) => toast.error(humanError(e)),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: DEBT_KEY });
      void qc.invalidateQueries({ queryKey: RESOURCES_KEY });
      void qc.invalidateQueries({ queryKey: ["session"] });
    },
  });
  const d = debt.data;
  if (!d) return null;
  // Сотые: вырез с продаж копейный, остаток «0,5» тоже должен закрываться.
  const max = Math.max(0, Math.floor(Math.min(gold, d.left) * 100) / 100);
  const n = Math.floor(Number(amount) * 100) / 100;
  const ok = Number.isFinite(n) && n > 0 && n <= max && !pay.isPending;
  return (
    <section
      className="mb-3 rounded-xl border border-red-500/60 bg-red-950/40 p-3 text-[#e9eff8]"
      aria-label={ru ? "Долг" : "Debt"}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{ru ? "Долг" : "Debt"}</h2>
        <strong className="text-2xl tabular-nums text-[#ffd773]">{fmt(d.left, ru)}</strong>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#e9eff8]/80">
        <span>
          {ru ? "Отдано" : "Paid"} {fmt(d.paid, ru)} / {fmt(d.total, ru)}
        </span>
        <span>{ru ? "Вывод закрыт" : "Withdrawals closed"}</span>
        <span>{ru ? "−50 % с продаж" : "−50% of sales"}</span>
      </div>
      <div className="mt-3 flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={0.01}
          step={0.01}
          max={max}
          value={amount}
          placeholder={ru ? "Сколько золота" : "Gold amount"}
          onChange={(e) => setAmount(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-[#ae8a50] bg-black/50 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={max <= 0 || pay.isPending}
          onClick={() => setAmount(String(max))}
          className="rounded-lg border border-[#ae8a50] px-3 text-sm disabled:opacity-50"
        >
          {ru ? "Всё" : "Max"}
        </button>
        <button
          type="button"
          data-game-button="primary"
          disabled={!ok}
          onClick={() => pay.mutate(n)}
          className="rounded-lg px-4 text-sm font-bold disabled:opacity-50"
        >
          {ru ? "Отдать" : "Pay"}
        </button>
      </div>
    </section>
  );
}

function fmt(v: number, ru: boolean): string {
  return v.toLocaleString(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 2 });
}
