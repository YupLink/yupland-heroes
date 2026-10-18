// Пополнение счёта звёздами Telegram.
//
// Оплата всегда идёт внутри Telegram — иначе звёзд не существует. Два пути:
//   • мини-апп — нативное окно WebApp.openInvoice, не выходя из игры;
//   • браузер — переход по ссылке t.me в Telegram, где игрок и платит.
// Начисление в обоих случаях приходит вебхуком; здесь мы лишь ждём, когда
// баланс подрастёт, и говорим об этом.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Star, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { createAccountStarsInvoice } from "@/server/api/currency/stars";
import { STARS_PRESETS, STARS_MIN, STARS_MAX } from "@/lib/stars";
import { ACC_BALANCES_KEY, useAccountBalances } from "@/lib/hooks/useAccountBalances";

/** Открыть счёт: в мини-аппе нативно, иначе — переходом в Telegram. */
function payInvoice(link: string, onPaid: () => void): "native" | "redirect" {
  const tg = (
    window as unknown as {
      Telegram?: { WebApp?: { openInvoice?: (u: string, cb: (s: string) => void) => void } };
    }
  ).Telegram?.WebApp;
  if (tg && typeof tg.openInvoice === "function") {
    try {
      tg.openInvoice(link, (status) => {
        if (status === "paid") onPaid();
      });
      return "native";
    } catch {
      /* мини-апп не поддержал — уходим в редирект */
    }
  }
  // ⚠️ Мы уже ВНЕ пользовательского жеста (ссылку ждали от сервера), поэтому
  // window.open как всплывающее окно браузер режет popup-блокировщиком — окно
  // не открывалось, а игрок видел только «жди зачисления». Навигация же
  // (location.href) блокировщику не подчиняется: уводим текущую вкладку прямо
  // в Telegram по ссылке t.me. Сначала пробуем новую вкладку (чтобы игра
  // осталась открытой), и только если её зарубили — уходим текущей.
  const w = window.open(link, "_blank");
  if (!w || w.closed || typeof w.closed === "undefined") {
    window.location.href = link;
  }
  return "redirect";
}

/** neededAmount — Торговый дом замка: сумма, которой не хватает на покупку,
 *  сразу стоит в поле. Без неё окно как раньше. */
export function StarsTopUp({ neededAmount }: { neededAmount?: number } = {}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState<number>(STARS_PRESETS[1]);
  const [custom, setCustom] = useState(() =>
    neededAmount != null && Number.isSafeInteger(neededAmount) && neededAmount > 0
      ? String(neededAmount)
      : "",
  );
  const [waiting, setWaiting] = useState(false);
  // Ссылка на оплату в Telegram — держим её видимой кнопкой на случай, если
  // авто-переход зарубит блокировщик (частый случай в мобильных браузерах).
  const [payLink, setPayLink] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  // Порог: баланс звёзд на момент старта оплаты. Как только фактический
  // перерастёт его — значит вебхук зачислил, ожидание можно снимать.
  const awaitFrom = useRef<number | null>(null);

  const bal = useAccountBalances();
  const starsNow = Number(
    (bal.data?.balances ?? []).find((b) => b.token.toUpperCase() === "STARS")?.balance ?? 0,
  );

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  // Зачисление пришло — снимаем «Ждём…», говорим спасибо, гасим таймеры.
  // Раньше в браузерном сценарии ожидание держалось фиксированно 42 секунды и
  // не реагировало на факт прихода: звёзды на счету, а кнопка всё «ждёт».
  useEffect(() => {
    if (awaitFrom.current == null) return;
    if (starsNow > awaitFrom.current) {
      const got = starsNow - awaitFrom.current;
      awaitFrom.current = null;
      setWaiting(false);
      setPayLink(null);
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
      toast.success(`Зачислено ${got}★ на счёт`);
    }
  }, [starsNow]);

  const value = custom.trim() ? Math.floor(Number(custom.replace(",", "."))) : amount;
  const valid = Number.isFinite(value) && value >= STARS_MIN && value <= STARS_MAX;

  // Звёзды приходят вебхуком за секунды; несколько раз освежаем баланс, чтобы
  // зачисление проявилось само, без перезагрузки.
  const pollBalance = () => {
    // Точка отсчёта — текущий баланс звёзд. Рост над ним = зачисление (эффект
    // выше поймает и снимет ожидание).
    awaitFrom.current = starsNow;
    setWaiting(true);
    [2000, 4000, 7000, 12000, 20000, 30000, 45000, 60000].forEach((ms) =>
      timers.current.push(
        window.setTimeout(() => qc.invalidateQueries({ queryKey: ACC_BALANCES_KEY }), ms),
      ),
    );
    // Потолок ожидания: если за минуту с лишним не пришло — перестаём крутить
    // (деньги всё равно догонит крон, а игрок не должен смотреть в вечный спиннер).
    timers.current.push(
      window.setTimeout(() => {
        awaitFrom.current = null;
        setWaiting(false);
      }, 75000),
    );
  };

  const pay = useMutation({
    mutationFn: () => createAccountStarsInvoice({ data: { amountStars: value } }),
    onSuccess: (r) => {
      const mode = payInvoice(r.link, () => {
        // Нативная оплата подтвердила «paid» — просто просим свежий баланс;
        // «Зачислено» покажет тот же эффект по факту прихода, без двойного тоста.
        qc.invalidateQueries({ queryKey: ACC_BALANCES_KEY });
      });
      if (mode === "redirect") {
        setPayLink(r.link);
        toast.message("Заверши оплату в Telegram — звёзды придут на счёт");
      }
      pollBalance();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-sky-400/40 bg-sky-500/10 px-3 py-2 text-[12px] text-sky-200">
        <Star className="h-4 w-4 shrink-0 fill-sky-300 text-sky-300" />
        Звёзды кладутся на счёт и тратятся на ресурсы. Вывести звёзды нельзя.
      </div>

      <div className="space-y-1.5">
        {STARS_PRESETS.map((n) => {
          const active = !custom.trim() && amount === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => {
                setAmount(n);
                setCustom("");
              }}
              className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 transition ${
                active
                  ? "border-sky-400/70 bg-sky-500/15"
                  : "border-border/60 bg-card/30 hover:bg-secondary/40"
              }`}
            >
              <span className="flex items-center gap-2 font-semibold">
                <Star
                  className={`h-4 w-4 ${active ? "fill-sky-300 text-sky-300" : "text-muted-foreground"}`}
                />
                {n}★
              </span>
              {active && <span className="text-[11px] text-sky-300">выбрано</span>}
            </button>
          );
        })}

        {/* «Своё» — любое число в разумных границах. */}
        <div
          className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 transition ${
            custom.trim() ? "border-sky-400/70 bg-sky-500/15" : "border-border/60 bg-card/30"
          }`}
        >
          <Star className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            inputMode="numeric"
            placeholder="своё количество"
            className="w-full bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground"
          />
          {custom.trim() && <span className="shrink-0 text-[12px] text-sky-300">★</span>}
        </div>
      </div>

      <button
        type="button"
        onClick={() => pay.mutate()}
        disabled={!valid || pay.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-sky-400/60 bg-sky-500/20 px-4 py-3 text-sm font-bold text-sky-100 transition hover:bg-sky-500/30 disabled:opacity-50"
      >
        {pay.isPending || waiting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Star className="h-4 w-4 fill-sky-200" />
        )}
        {waiting ? "Ждём зачисление…" : valid ? `Оплатить ${value}★` : "Укажи количество"}
      </button>

      {/* Страховка: если авто-переход в Telegram зарубил блокировщик, эта
          ссылка открывает оплату по прямому нажатию (жесту) — оно не режется. */}
      {payLink && (
        <a
          href={payLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-sky-400/40 bg-sky-500/5 px-3 py-2 text-[12px] font-semibold text-sky-200 transition hover:bg-sky-500/15"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Не открылось? Открыть оплату в Telegram
        </a>
      )}
    </div>
  );
}
