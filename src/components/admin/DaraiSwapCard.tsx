// Обмен USDT → DARAI на Ref Finance с зачислением в пул карты.
//
// Поле в долларах + кнопка. Под полем — живая котировка (сколько DARAI придёт
// и проскальзывание). Обмен двигает реальные средства, поэтому кнопка требует
// второго клика-подтверждения. Пришедшие DARAI сервер сам кладёт в пул карты
// и шлёт владельцу в бота фактическую сумму.
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Repeat, ArrowDown, AlertTriangle } from "lucide-react";
import { adminQuoteUsdtToDarai, adminSwapUsdtToDarai } from "@/server/api/ref-swap";
import { SWAP_MAX_USDT, SWAP_MIN_USDT } from "@/lib/refSwapLimits";
import { humanError } from "@/lib/humanError";
import { fmt } from "./daraiPayoutShared";

export function DaraiSwapCard() {
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(amount), 600);
    return () => clearTimeout(id);
  }, [amount]);

  const usdt = (() => {
    const v = Number(debounced.replace(/[^\d.]/g, ""));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  })();
  const inRange = usdt != null && usdt >= SWAP_MIN_USDT && usdt <= SWAP_MAX_USDT;

  // Любое изменение суммы сбрасывает взведённое подтверждение.
  useEffect(() => setConfirming(false), [amount]);

  const quote = useQuery({
    queryKey: ["admin", "ref-swap-quote", usdt],
    queryFn: () => adminQuoteUsdtToDarai({ data: { usdtHuman: usdt! } }),
    enabled: inRange,
    staleTime: 15_000,
  });

  const qc = useQueryClient();
  const swap = useMutation({
    mutationFn: () => adminSwapUsdtToDarai({ data: { usdtHuman: usdt! } }),
    onSuccess: (r) => {
      if (r.daraiReceived > 0) {
        toast.success(`Обмен: +${fmt(r.daraiReceived)} DARAI в пул карты`);
      } else {
        toast.warning("Обмен прошёл, но приход DARAI не виден — проверь бота");
      }
      qc.invalidateQueries({ queryKey: ["admin", "darai-distribution"] });
      setAmount("");
      setConfirming(false);
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
      setConfirming(false);
    },
  });

  const impactPct = quote.data?.priceImpact != null ? quote.data.priceImpact * 100 : null;
  const highImpact = impactPct != null && impactPct >= 10;

  return (
    <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/5 p-4">
      <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-cyan-300">
        <Repeat className="h-3.5 w-3.5" /> Обмен USDT → DARAI в пул карты
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Продаёт USDT на Ref Finance. Всё, что придёт, зачисляется в пул карты; фактическую
        сумму пришлём в бота.
      </p>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
            Сумма, USDT
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-cyan-300">
              $
            </span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="20"
              className="w-full rounded-xl border border-cyan-400/30 bg-background/60 py-2.5 pl-7 pr-3 font-mono text-base outline-none focus:border-cyan-400/70"
            />
          </div>
        </div>
        <button
          type="button"
          disabled={!inRange || quote.isError || swap.isPending || (confirming && quote.isFetching)}
          onClick={() => {
            if (!confirming) {
              setConfirming(true);
              return;
            }
            swap.mutate();
          }}
          className={`inline-flex h-[42px] items-center gap-2 rounded-xl px-4 text-sm font-bold transition disabled:opacity-40 ${
            confirming
              ? "bg-rose-500 text-white hover:bg-rose-400"
              : "bg-cyan-500 text-white hover:bg-cyan-400"
          }`}
        >
          {swap.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Repeat className="h-4 w-4" />
          )}
          {swap.isPending ? "Меняю…" : confirming ? "Подтвердить" : "Обменять"}
        </button>
      </div>

      {/* Котировка / получишь взамен */}
      <div className="mt-3 min-h-[46px] rounded-xl border border-border/50 bg-background/40 px-3 py-2">
        {!inRange ? (
          <div className="text-[11px] text-muted-foreground">
            От {SWAP_MIN_USDT} до {SWAP_MAX_USDT} USDT за раз.
          </div>
        ) : quote.isLoading ? (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Считаем маршрут…
          </div>
        ) : quote.isError || !quote.data ? (
          <div className="text-[11px] text-rose-300">
            {quote.error instanceof Error ? humanError(quote.error) : "Маршрут не найден"}
          </div>
        ) : (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <ArrowDown className="h-3 w-3" /> Получишь примерно
            </div>
            <div className="font-mono text-lg font-bold text-cyan-200">
              {fmt(quote.data.daraiOutHuman)} DARAI
            </div>
            <div className="text-[10px] text-muted-foreground">
              курс {fmt(quote.data.rate)} DARAI/$ · {quote.data.hops} хопа
              {impactPct != null && (
                <span className={highImpact ? "text-rose-300" : "text-muted-foreground"}>
                  {" "}
                  · проскальзывание {impactPct.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {confirming && inRange && quote.data && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Продать <span className="font-mono">${usdt}</span> USDT за ~
            <span className="font-mono">{fmt(quote.data.daraiOutHuman)}</span> DARAI. Реальные
            средства. Нажми «Подтвердить» ещё раз.
          </span>
        </div>
      )}
    </div>
  );
}
