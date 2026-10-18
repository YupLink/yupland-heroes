// Вывод со счёта: единственное место, где деньги уходят наружу.
//
// Списание происходит сразу, заявка ложится в ту же таблицу, что и награды, —
// но сама по себе она никуда не поедет: очередь выплат никто не разбирает по
// расписанию, её запускает нажатие игрока. Поэтому отправку зовём вторым шагом
// прямо отсюда. Если он не пройдёт, заявка остаётся и её можно дослать
// кнопкой — деньги при этом уже списаны и никуда не денутся.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpFromLine, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { withdrawTokens } from "@/server/api/user-payouts-withdraw";
import { ACC_BALANCES_KEY, useAccountBalances } from "@/lib/hooks/useAccountBalances";
import type { TokenInfo } from "./AccountBalances";
import { HOLDER_TAG_KEY, HolderWithdrawNote } from "./HolderWithdrawNote";

export function AccountWithdraw({
  tokens,
  wallets,
  symbol,
}: {
  tokens?: TokenInfo[];
  wallets?: string[];
  /** Выбранная валюта: ею управляет список балансов сверху. */
  symbol: string;
}) {
  const qc = useQueryClient();
  const balances = useAccountBalances();
  // Форме данных не верим: ответ сервера лежит у игрока в localStorage сутки,
  // и вчерашний ответ приходит без полей, добавленных сегодня (§11.13).
  const list = Array.isArray(wallets) ? wallets : [];
  const all = Array.isArray(tokens) ? tokens : [];
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState(list[0] ?? "");

  // Выводить есть смысл только то, что на счёте лежит.
  const map = new Map(
    (Array.isArray(balances.data?.balances) ? balances.data.balances : []).map((b) => [
      b.token.toLowerCase(),
      b.balance,
    ]),
  );
  const withMoney = all.filter((t) => (map.get(t.symbol.toLowerCase()) ?? 0) > 0);
  const token = withMoney.find((t) => t.symbol === symbol) ?? withMoney[0];
  const have = token ? (map.get(token.symbol.toLowerCase()) ?? 0) : 0;
  // Только целыми: дробный остаток копится на счёте и уйдёт следующим выводом.
  const value = Math.floor(Number(amount.replace(",", ".")));
  const valid =
    !!token && Number.isFinite(value) && value > 0 && value <= have && value >= token.minWithdraw;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ACC_BALANCES_KEY });
    // «Мои NFT» показывает тот же баланс — обновляем и его, иначе там
    // висит цифра до покупки, и кажется, что деньги не списались.
    qc.invalidateQueries({ queryKey: ["my-payouts"] });
    qc.invalidateQueries({ queryKey: ["acc-history"] });
    qc.invalidateQueries({ queryKey: HOLDER_TAG_KEY });
  };

  const send = useMutation({
    // Один вызов на всё: он и заявку заведёт со счёта, и отправит её тем же
    // конвейером, что возит награды. Второй терминал вывода — «Мои NFT» —
    // ходит ровно сюда же, поэтому деньги у них общие.
    mutationFn: () => {
      if (!token) throw new Error("Нечего выводить");
      return withdrawTokens({
        data: { symbol: token.symbol, recipient: recipient.trim(), amount: value },
      });
    },
    onSuccess: (res) => {
      const ok = res.results.filter((r) => !r.error);
      const bad = res.results.filter((r) => r.error);
      for (const r of ok) toast.success(`Выведено ${r.amount} ${r.symbol}`);
      for (const r of bad) toast.error(`${r.symbol}: ${r.error ?? "не ушло"}`);
      if (ok.length === 0 && bad.length === 0) toast.success("Заявка создана");
      setAmount("");
      refresh();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  if (withMoney.length === 0) {
    return <p className="text-xs text-muted-foreground">Пока выводить нечего — счёт пуст.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Валюта названа в шапке окна — выбирать её здесь ещё раз незачем. */}
      <div className="grid gap-2 grid-cols-[minmax(0,88px)_minmax(0,1fr)]">
        <div className="flex items-center justify-center rounded-lg border border-border/60 bg-secondary/20 px-3 py-2.5 text-sm font-semibold text-muted-foreground">
          {token?.symbol ?? "—"}
        </div>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder={
            token
              ? `есть ${have.toLocaleString("ru-RU")}, минимум ${token.minWithdraw.toLocaleString("ru-RU")}`
              : "сколько"
          }
          className="rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-gold/60"
        />
      </div>

      <select
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-xs outline-none focus:border-gold/60"
      >
        {list.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </select>

      {token?.symbol === "Darai" && (
        <HolderWithdrawNote amount={valid ? value : 0} balance={have} />
      )}

      <button
        type="button"
        onClick={() => send.mutate()}
        disabled={!valid || !recipient || send.isPending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/5 px-4 py-3 text-sm font-bold text-gold transition hover:bg-gold/10 disabled:opacity-50"
      >
        {send.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ArrowUpFromLine className="h-4 w-4" />
        )}
        Создать заявку
      </button>

      {/* Минимум пишем ЗАРАНЕЕ. Раньше он всплывал только отказом после
          нажатия, и игрок с 83 000 Darai при пороге в миллион читал это как
          поломку игры. */}
      {token && (
        <p
          className={`text-[11px] ${
            have < token.minWithdraw ? "text-amber-400" : "text-muted-foreground"
          }`}
        >
          Минимальный вывод {token.symbol} — {token.minWithdraw.toLocaleString("ru-RU")}
          {have < token.minWithdraw
            ? `. У тебя ${have.toLocaleString("ru-RU", { maximumFractionDigits: 4 })} — пока не хватает, копи дальше.`
            : "."}
        </p>
      )}

      <p className="text-[11px] text-muted-foreground">
        Со счёта спишется сразу, следом уйдёт перевод. Только целыми числами, получатель — только
        свой кошелёк.
      </p>
    </div>
  );
}
