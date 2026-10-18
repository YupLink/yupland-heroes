// Свободные USDT — полоска над картой рядом с пулом Darai, только админу.
//
// Darai проект чеканит сам, USDT надо иметь. Перед тем как наполнять карту
// монетой, админ должен видеть, сколько её свободно: на кошельке лежит одна
// куча, но часть уже обещана игрокам — их счета, незабранные награды, то, что
// уже разложено по объектам, и заявки на вывод в работе.
//
// Минус — не поломка, а «раздали больше, чем есть»: карта продолжит выдавать
// награды, но пополнять кошелёк надо до, а не после.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { getFreeTokenPools } from "@/server/api/token-free-pool";
import { AdminPoolDetails } from "./AdminPoolDetails";

/** Пока следим за одной монетой: реальные деньги на карте — это USDT. */
const SYMBOLS = ["USDT"];

export const FREE_TOKEN_KEY = ["free-token-pools", ...SYMBOLS] as const;

export function AdminFreeTokenBar() {
  const lang = useLang();
  const ru = lang !== "en";
  const fmt = (n: number) =>
    new Intl.NumberFormat(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 2 }).format(n);

  const pools = useQuery({
    queryKey: FREE_TOKEN_KEY,
    queryFn: () => getFreeTokenPools({ data: { symbols: SYMBOLS } }),
    // Остаток кошелька читается из сети: обновляем по правкам карты, а не на
    // каждый возврат фокуса.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const p = pools.data?.[0] ?? null;
  const free = p?.free ?? null;
  const short = free !== null && free < 0;

  const [open, setOpen] = useState(false);
  const lines = p
    ? [
        { label: ru ? "На кошельке" : "On the wallet", value: fmt(p.walletBalance ?? 0) },
        {
          label: ru ? "На счетах игроков" : "On player accounts",
          value: fmt(p.playerBalances),
          muted: true,
        },
        {
          label: ru ? "Не забранные награды" : "Unclaimed rewards",
          value: fmt(p.queuedRewards),
          muted: true,
        },
        { label: ru ? "Стоит на карте" : "Standing on the map", value: fmt(p.onMap) },
        {
          label: ru ? "Выводы в работе" : "Withdrawals in flight",
          value: fmt(p.payoutsPending),
          muted: true,
        },
      ]
    : [];

  return (
    <div className="flex w-full flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-lg border border-border/60 bg-secondary/30 px-2 py-1 text-left"
      >
        <Wallet className={cn("h-3.5 w-3.5", short ? "text-red-500" : "text-muted-foreground")} />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {ru ? `Свободно ${SYMBOLS[0]}` : `${SYMBOLS[0]} free`}
        </span>
        {short && (
          <span className="text-[10px] font-semibold text-red-500">
            {ru ? "перерасход" : "overdrawn"}
          </span>
        )}
        <span
          className={cn(
            "ml-auto text-[12px] font-bold tabular-nums",
            short ? "text-red-500" : "text-foreground",
          )}
        >
          {pools.isPending ? "…" : free === null ? (ru ? "нет связи" : "unavailable") : fmt(free)}
        </span>
      </button>
      {open && lines.length > 0 && <AdminPoolDetails lines={lines} />}
    </div>
  );
}
