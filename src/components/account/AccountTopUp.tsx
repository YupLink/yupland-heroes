// Пополнение счёта: единственное место, где деньги входят внутрь игры.
//
// Порядок: подписал → записали ожидание → через минуту проверили и зачислили.
//
// Прежде проверка начиналась сразу после подписи, то есть в момент, когда
// индексер транзакцию ещё физически не видит. Она честно не находила перевод,
// игрок читал «транзакция не найдена» над только что ушедшими деньгами и шёл
// искать хэш руками — а начисляли ему потом вручную. Пять запросов к Sendler
// на каждую такую попытку уходили заведомо впустую.
//
// Хэш всё равно сохраняется СРАЗУ после подписи и переживает перезагрузку:
// теперь и на сервере (очередь ожидания), и локально — иначе перевод остаётся
// ничей, а деньги уже ушли.
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { signFtTransfer } from "@/lib/ftTransfer";
import { verifyAccountDeposit } from "@/server/api/currency/deposit";
import { registerAccountDeposit } from "@/server/api/credit-wait-api";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";
import { useCreditNotices } from "@/lib/hooks/useCreditNotices";
import { armCreditWatch } from "@/lib/creditWaitBus";
import { TopUpWaiting } from "./TopUpWaiting";
import { TopUpByHash } from "./TopUpByHash";
import type { TokenInfo } from "./AccountBalances";

const PENDING_KEY = "acc-pending-tx";

type Pending = { txHash: string; symbol: string; amount: number; at?: number; waitSec?: number };

function readPending(): Pending | null {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}

function writePending(v: Pending | null) {
  try {
    if (v) window.localStorage.setItem(PENDING_KEY, JSON.stringify(v));
    else window.localStorage.removeItem(PENDING_KEY);
  } catch {
    /* приватный режим — переживём */
  }
}

export function AccountTopUp({
  tokens,
  receiverId,
  symbol,
}: {
  tokens?: TokenInfo[];
  receiverId?: string;
  /** Выбранная валюта: ею управляет список балансов сверху. */
  symbol: string;
}) {
  const qc = useQueryClient();
  const { poll, pollLater } = useCreditNotices();
  // Вчерашний ответ из кэша приходит без новых полей — не падаем на этом.
  const open = (Array.isArray(tokens) ? tokens : []).filter((t) => t.allowed);
  const [amount, setAmount] = useState("");
  const [hash, setHash] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => setPending(readPending()), []);
  // Сумма не переживает смену токена: у токенов реестра от нуля до
  // восемнадцати знаков, и «1000» для Darai и для USDT — разные деньги.
  useEffect(() => setAmount(""), [symbol]);

  // Ожидание считается свежим, пока идёт обещанная минута с запасом: после
  // этого молчаливое колесо превращается в обман, и нужна кнопка.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const fresh = !!pending?.at && now - pending.at < ((pending.waitSec ?? 60) + 90) * 1000;

  const token = open.find((t) => t.symbol === symbol) ?? open[0];
  // Считаем целыми: на счёт кладём и с него забираем без дробей.
  const value = Math.floor(Number(amount.replace(",", ".")));
  const enough = !!token && Number.isFinite(value) && value >= token.min;

  const done = (r: { applied: boolean; amount: number; token: string }) => {
    toast.success(
      r.applied ? `Зачли ${r.amount} ${r.token}` : "Эта квитанция уже была зачтена раньше",
    );
    setAmount("");
    setHash("");
    writePending(null);
    setPending(null);
    qc.invalidateQueries({ queryKey: ACC_BALANCES_KEY });
    // «Мои NFT» показывает тот же баланс — обновляем и его, иначе там
    // висит цифра до покупки, и кажется, что деньги не списались.
    qc.invalidateQueries({ queryKey: ["my-payouts"] });
    qc.invalidateQueries({ queryKey: ["acc-history"] });
  };

  /** Срок вышел — сходить за результатом. Молча: новости покажет хук. */
  const collect = useCallback(async () => {
    const { fresh } = await poll();
    if (fresh > 0) {
      setAmount("");
      writePending(null);
      setPending(null);
      return;
    }
    // Индексер чуть отстал. Серверная строка созреет снова через минуту —
    // возвращаемся за ней ровно один раз, а дальше уже дело крона.
    pollLater(70_000);
  }, [poll, pollLater]);

  const send = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Выбери токен");
      const txHash = await signFtTransfer({
        ftContract: token.ftContract,
        receiverId: receiverId ?? "",
        amountHuman: value,
        decimals: token.decimals,
      });
      // Записываем ожидание СРАЗУ и ничего не проверяем: в сети транзакции
      // сейчас всё равно ещё нет. С этого момента перевод не ничей — его
      // доведёт до счёта либо таймер на этой странице, либо крон.
      const reg = await registerAccountDeposit({
        data: { txHash, token: token.symbol },
      }).catch(() => ({ waitSec: 60 }));
      // Окно Казны могут закрыть — за зачислением сходит и глобальный сторож.
      armCreditWatch();
      const mark = {
        txHash,
        symbol: token.symbol,
        amount: value,
        at: Date.now(),
        waitSec: reg.waitSec ?? 60,
      };
      writePending(mark);
      setPending(mark);
      return mark;
    },
    onError: (e: Error) =>
      toast.error(/cancel|reject|deny/i.test(e.message) ? "Отменено в кошельке" : humanError(e)),
  });

  const credit = useMutation({
    mutationFn: (input: { txHash: string; symbol: string }) =>
      verifyAccountDeposit({ data: { txHash: input.txHash.trim(), token: input.symbol } }),
    onSuccess: done,
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="space-y-3">
      {pending &&
        (fresh ? (
          // Свежий перевод: идёт обещанная минута.
          <TopUpWaiting
            amount={pending.amount}
            symbol={pending.symbol}
            waitSec={pending.waitSec ?? 60}
            startedAt={pending.at ?? Date.now()}
            onDue={collect}
          />
        ) : (
          // Минута давно прошла, а зачисления нет. Это уже не ожидание, а
          // повод дать игроку кнопку — хотя догон и крон продолжают сами.
          <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-400">
              <TriangleAlert className="h-3.5 w-3.5" />
              Перевод ещё не зачтён: {pending.amount} {pending.symbol}
            </div>
            <div className="break-all font-mono text-[10px] text-muted-foreground">
              {pending.txHash}
            </div>
            <button
              type="button"
              onClick={() => credit.mutate({ txHash: pending.txHash, symbol: pending.symbol })}
              disabled={credit.isPending}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] font-semibold text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
            >
              {credit.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Зачесть сейчас
            </button>
          </div>
        ))}

      {/* Валюта уже выбрана в списке счёта и написана в шапке окна. Второй
          выбор здесь только сбивал: он выглядел как вопрос, ответ на который
          уже дали. */}
      <div className="grid gap-2 grid-cols-[minmax(0,88px)_minmax(0,1fr)]">
        <div className="flex items-center justify-center rounded-lg border border-border/60 bg-secondary/20 px-3 py-2.5 text-sm font-semibold text-muted-foreground">
          {token?.symbol ?? "—"}
        </div>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder={token ? `минимум ${token.min.toLocaleString("ru-RU")}` : "сколько"}
          className="rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-gold/60"
        />
      </div>

      {enough && token && (
        <div className="rounded-lg border border-border/60 bg-secondary/10 px-3 py-2 font-mono text-[11px]">
          {value.toLocaleString("ru-RU")} {token.symbol} → {receiverId}
        </div>
      )}

      <button
        type="button"
        onClick={() => send.mutate()}
        disabled={!enough || send.isPending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3 text-sm font-bold text-background transition hover:brightness-110 disabled:opacity-50"
      >
        {send.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ArrowDownToLine className="h-4 w-4" />
        )}
        {send.isPending ? "Подписываем перевод…" : "Подписать перевод"}
      </button>

      <p className="text-[11px] text-muted-foreground">
        Зачисление придёт примерно через минуту — столько сети нужно, чтобы подтвердить перевод.
        Ждать на этой странице не обязательно.
      </p>

      <TopUpByHash
        hash={hash}
        onHash={setHash}
        symbol={token?.symbol}
        busy={credit.isPending}
        onCredit={() => token && credit.mutate({ txHash: hash, symbol: token.symbol })}
      />
    </div>
  );
}
