// YUPLINK · Распределение DARAI — калькулятор + рассылка.
//
// База раздачи — НЕ весь баланс коша, а доступное к раздаче: на
// darai_gdrop.near вперемешку лежат доход с продаж и игровой пул под карту
// (его завела коллекция). Раскладка — в «Источнике», чужие деньги игроков —
// в «Обязательствах».

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adminGetDaraiDistributionPreview,
  adminDistributeDarai,
} from "@/server/api/payouts";
import { toast } from "sonner";
import { Loader2, Crown, Send, AlertTriangle, ShieldAlert, ChevronDown } from "lucide-react";
import { humanError } from "@/lib/humanError";
import { fmt, SplitRow } from "./daraiPayoutShared";
import { DaraiSourceCard } from "./DaraiSourceCard";
import { DaraiObligationsCard } from "./DaraiObligationsCard";
import { DaraiAmountCard } from "./DaraiAmountCard";
import { DaraiAutoLine } from "./DaraiAutoLine";
import { DaraiLegendaryHolders } from "./DaraiLegendaryHolders";
import { DaraiDistributeConfirm } from "./DaraiDistributeConfirm";
import { DaraiTreasuryPanel } from "./DaraiTreasuryPanel";

// Комиссия маркета живёт отдельным файлом, но исторически импортируется
// отсюда (admin.shop.tsx) — держим реэкспорт.
export { MarketFeesCard } from "./MarketFeesCard";

export function DaraiDistributionPanel() {
  const [customAmount, setCustomAmount] = useState<string>("");
  // Двухступенчатое подтверждение опасной рассылки: открываем модалку,
  // в ней админ должен вручную ввести слово-подтверждение.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  // Debounce: пересчитываем preview не на каждую цифру, а через 600мс
  // тишины. Раньше любое нажатие в input рестартовало запрос —
  // визуально страница «мигала» на каждую цифру.
  const [debouncedAmount, setDebouncedAmount] = useState<string>("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedAmount(customAmount), 600);
    return () => clearTimeout(id);
  }, [customAmount]);

  const customNum = (() => {
    const v = Number(debouncedAmount.replace(/[^\d.]/g, ""));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  })();

  const q = useQuery({
    queryKey: ["admin", "darai-distribution", customNum ?? "available"],
    queryFn: () =>
      adminGetDaraiDistributionPreview({
        data: customNum ? { amountHuman: customNum } : {},
      }),
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });

  const qc = useQueryClient();
  const distribute = useMutation({
    mutationFn: () =>
      adminDistributeDarai({
        data: customNum ? { amountHuman: customNum } : {},
      }),
    onSuccess: (r) => {
      toast.success(r.message);
      qc.invalidateQueries({ queryKey: ["admin", "darai-distribution"] });
      setConfirmOpen(false);
      setConfirmInput("");
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Считаем…
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-300">
        Ошибка: {q.error instanceof Error ? q.error.message : "—"}
      </div>
    );
  }

  const d = q.data;
  const recipients = 3 + d.legendary.holders.length;

  return (
    <div className="space-y-4">
      {/* Статистика лута и обмен — общая часть: её же видит коллекция DARAI
          (DaraiTreasuryPanel), у которой прав на саму раздачу нет. */}
      <DaraiTreasuryPanel />

      {/* Расчёты и обеспечение — раскрывающимся списком, чтобы не занимать
          пол-экрана над самой раздачей. */}
      <details className="group rounded-2xl border border-border/60 bg-card/40">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Расчёты и обеспечение
          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
        </summary>
        <div className="space-y-3 px-3 pb-3">
          <DaraiSourceCard d={d} onRefresh={() => q.refetch()} refreshing={q.isFetching} />
          <DaraiObligationsCard d={d} />
        </div>
      </details>

      <DaraiAutoLine />
      <DaraiAmountCard d={d} value={customAmount} onChange={setCustomAmount} />

      {/* Splits */}
      <div className="grid gap-3 sm:grid-cols-2">
        <SplitRow
          color="border-violet-400/30 bg-violet-400/5 text-violet-300"
          title="Дупло"
          wallet={d.duplo.wallet}
          percent={d.duplo.sharePercent}
          amount={d.duplo.amountHuman}
        />
        <SplitRow
          color="border-sky-400/30 bg-sky-400/5 text-sky-300"
          title="player03"
          wallet={d.yarsib.wallet}
          percent={d.yarsib.sharePercent}
          amount={d.yarsib.amountHuman}
        />
        <SplitRow
          color="border-emerald-400/30 bg-emerald-400/5 text-emerald-300"
          title="miplix"
          wallet={d.miplix.wallet}
          percent={d.miplix.sharePercent}
          amount={d.miplix.amountHuman}
        />
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-amber-300">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest">
            <Crown className="h-3 w-3" />
            Держатели легендарок ({d.legendary.sharePercent}%)
          </div>
          <div className="mt-0.5 font-mono text-lg font-bold">
            {fmt(d.legendary.totalHuman)} DARAI
          </div>
          <div className="text-[10px] text-muted-foreground">
            делим на {d.legendary.activeNftsCount} NFT · по{" "}
            <span className="font-mono text-amber-300">
              {fmt(d.legendary.perNftHuman)}
            </span>{" "}
            на 1 NFT · {d.legendary.activeHoldersCount} держателей
          </div>
        </div>
      </div>

      {/* ОПАСНАЯ ЗОНА — реальная рассылка средств */}
      <div className="rounded-2xl border-2 border-rose-500/60 bg-rose-500/10 p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-rose-300">
            <ShieldAlert className="h-4 w-4" /> Опасная зона · рассылка
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-200">
            <AlertTriangle className="h-3 w-3" /> Двигает реальные средства
          </span>
        </div>
        <div
          className="mb-3 text-[11px] text-muted-foreground"
          title="Одной транзакцией, получатели разбиваются по 15 на подпись, атомарно — либо всё, либо ничего."
        >
          Отправит{" "}
          <span className="font-mono text-rose-200">{fmt(d.totalHuman)}</span>{" "}
          DARAI на {recipients} получателей: duplo, player03, miplix и{" "}
          {d.legendary.holders.length} держателей легендарок. Одно подтверждение
          в TG.
        </div>
        <button
          type="button"
          disabled={distribute.isPending}
          onClick={() => {
            setConfirmInput("");
            setConfirmOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-full bg-rose-500 px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_18px_rgba(244,63,94,0.45)] transition hover:bg-rose-400 disabled:opacity-50"
        >
          {distribute.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Разослать…
        </button>
      </div>

      {confirmOpen && (
        <DaraiDistributeConfirm
          recipients={recipients}
          totalHuman={d.totalHuman}
          pending={distribute.isPending}
          input={confirmInput}
          onInput={setConfirmInput}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => distribute.mutate()}
        />
      )}

      <DaraiLegendaryHolders d={d} />
    </div>
  );
}
