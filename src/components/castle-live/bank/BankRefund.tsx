// Возврат за постройку банка (владелец, 21.10.2026): банк теперь у всех построен
// сразу. Кто строил раньше, при входе в банк видит, сколько ресурсов вернётся, и
// «ОК» — ресурсы сразу на баланс, не подарком (castle-bank.ts).
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { claimBankRefund } from "@/server/api/bank/castle-bank";
import type { BankCost } from "@/lib/castleBank";
import { useCastleBank } from "../useWithBank";
import { refreshBank } from "./bankKeys";

const RES: Array<{ key: keyof BankCost; icon: string }> = [
  { key: "wood", icon: "/resources/wood.webp" },
  { key: "stone", icon: "/resources/stone.webp" },
  { key: "gold", icon: "/resources/gold.webp" },
  { key: "diamonds", icon: "/resources/crystal.webp" },
];

export function BankRefund({ ru }: { ru: boolean }) {
  const qc = useQueryClient();
  // Ответ старой формы (кэш на устройстве) без refund — окна нет.
  const refund = useCastleBank().data?.refund ?? null;
  const claim = useMutation({
    mutationFn: () => claimBankRefund(),
    onSuccess: () => void refreshBank(qc),
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : String(e));
      void refreshBank(qc);
    },
  });
  if (!refund || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={ru ? "Возврат за постройку банка" : "Bank construction refund"}
    >
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-[#ffffff1f] bg-[#0d1b2b] p-5 text-[#fff0c7]">
        <h2 className="text-lg font-bold">{ru ? "Возврат за постройку банка" : "Bank construction refund"}</h2>
        <div className="grid grid-cols-2 gap-2">
          {RES.filter((r) => refund[r.key] > 0).map((r) => (
            <span key={r.key} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-base font-bold">
              <img src={r.icon} alt="" className="h-6 w-6" />
              {refund[r.key].toLocaleString(ru ? "ru-RU" : "en-US")}
            </span>
          ))}
        </div>
        <button
          type="button"
          className="flex h-11 w-full items-center justify-center rounded-xl bg-[#e8b65a] text-base font-bold text-[#1a1206] disabled:opacity-60"
          disabled={claim.isPending}
          onClick={() => claim.mutate()}
        >
          {claim.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "OK"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
