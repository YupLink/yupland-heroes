// Что лежит на счёте — все валюты сразу, с действиями при каждой.
//
// Показываем весь реестр, а не только непустые: пополнять можно любую, и
// искать её через выпадающий список — лишний шаг. Те, на которых есть деньги,
// идут первыми и подсвечены; пустые остаются рядом, приглушённые.
import { ArrowUpFromLine, Loader2, Plus, Star } from "lucide-react";
import { useAccountBalances } from "@/lib/hooks/useAccountBalances";
import { useEntryRules } from "@/hooks/useEntryRules";

export type TokenInfo = {
  symbol: string;
  ftContract: string;
  decimals: number;
  wholeOnly: boolean;
  min: number;
  minWithdraw: number;
  allowed: boolean;
  /** Внутренний ресурс за Telegram Stars: свой поток пополнения, без вывода. */
  stars?: boolean;
};

export function AccountBalances({
  tokens,
  onTopUp,
  onWithdraw,
}: {
  tokens?: TokenInfo[];
  onTopUp: (symbol: string) => void;
  onWithdraw: (symbol: string) => void;
}) {
  const q = useAccountBalances();
  // §8.127: звёзды — только с Telegram; «только Google» не пополняет; вывод — списку.
  const rules = useEntryRules();

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const all = Array.isArray(tokens) ? tokens : [];
  const map = new Map(
    (Array.isArray(q.data?.balances) ? q.data.balances : []).map((b) => [
      b.token.toLowerCase(),
      b.balance,
    ]),
  );
  const balanceOf = (s: string) => map.get(s.toLowerCase()) ?? 0;
  // STARS всегда первым и отдельно — это внутренний ресурс за Telegram Stars,
  // с собственным оформлением и без вывода. Остальные монеты — как обычно:
  // деньги вверх, дальше по алфавиту.
  const stars = rules.stars ? all.find((t) => t.stars) : undefined;
  const rest = all
    .filter((t) => !t.stars)
    .sort(
      (a, b) => balanceOf(b.symbol) - balanceOf(a.symbol) || a.symbol.localeCompare(b.symbol),
    );

  return (
    <div className="space-y-2">
      {stars && (
        <button
          type="button"
          onClick={() => onTopUp(stars.symbol)}
          className="flex w-full items-center gap-3 rounded-2xl border border-sky-400/50 bg-sky-500/10 px-3.5 py-3 text-left transition hover:bg-sky-500/15"
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-500/20 text-sky-300">
            <Star className="h-5 w-5 fill-sky-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] uppercase tracking-widest text-sky-300/80">
              Telegram Stars
            </div>
            <div className="truncate font-mono text-lg font-bold tabular-nums text-sky-200">
              {balanceOf(stars.symbol).toLocaleString("ru-RU")}
            </div>
          </div>
          <span className="flex h-8 items-center gap-1.5 rounded-xl border border-sky-400/40 bg-sky-500/15 px-3 text-[12px] font-semibold text-sky-200">
            <Plus className="h-3.5 w-3.5" /> Пополнить
          </span>
        </button>
      )}

    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {rest.map((t) => {
        const value = balanceOf(t.symbol);
        const has = value > 0;
        return (
          <div
            key={t.symbol}
            className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 ${
              has ? "border-gold/25 bg-gold/5" : "border-border/60 bg-card/30"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t.symbol}
              </div>
              <div
                className={`truncate font-mono text-lg font-bold tabular-nums ${
                  has ? "text-gold" : "text-muted-foreground"
                }`}
              >
                {value.toLocaleString("ru-RU", { maximumFractionDigits: 8 })}
              </div>
            </div>
            {!rules.googleOnly && <button
              type="button"
              onClick={() => onTopUp(t.symbol)}
              title={`Пополнить ${t.symbol}`}
              disabled={!t.allowed}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-gold/30 bg-gold/10 text-gold transition hover:bg-gold/20 disabled:opacity-30"
            >
              <Plus className="h-4 w-4" />
            </button>}
            {rules.canWithdraw && <button
              type="button"
              onClick={() => onWithdraw(t.symbol)}
              title={has ? `Вывести ${t.symbol}` : `На счету нет ${t.symbol} — выводить нечего`}
              disabled={!has}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition hover:bg-secondary disabled:opacity-25"
            >
              <ArrowUpFromLine className="h-4 w-4" />
            </button>}
          </div>
        );
      })}
    </div>
    </div>
  );
}
