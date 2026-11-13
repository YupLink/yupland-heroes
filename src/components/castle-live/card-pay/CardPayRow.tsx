// «Оплатить картой» (Xsolla, §8.127): строка способа оплаты в окнах золота и подписки —
// только аккаунту, у которого единственный вход Google (сервер решает: getCardPay).
// Нажатие — заказ на сервере и переход в окно оплаты Xsolla; золото или подписку
// выдаёт сервер, когда Xsolla сообщит об оплате.
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, CreditCard } from "lucide-react";
import { humanError } from "@/lib/humanError";
import { getCardPay, startCardPayment } from "@/server/api/xsolla/xsollaPay";

export function CardPayRow({
  sku,
  usd,
  ru,
  locked = false,
  offText = false,
}: {
  sku: string;
  usd: number;
  ru: boolean;
  locked?: boolean;
  /** Карта — единственный способ («только Google»): закрыта — так и сказать. */
  offText?: boolean;
}) {
  const cfg = useQuery({ queryKey: ["card-pay"], queryFn: () => getCardPay(), staleTime: 5 * 60_000 });
  const pay = useMutation({
    mutationFn: () =>
      startCardPayment({
        data: { sku, returnPath: window.location.pathname, lang: ru ? "ru" : "en" },
      }),
    onSuccess: (r) => window.location.assign(r.url),
  });
  if (!cfg.data?.on)
    return offText && cfg.data ? (
      <p className="energy-buy__status" role="status">
        {ru ? "Оплата картой сейчас недоступна" : "Card payment is unavailable right now"}
      </p>
    ) : null;
  const price = `$${usd.toLocaleString(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 2 })}`;
  return (
    <div className="energy-buy__methods">
      <button
        type="button"
        className="energy-buy__method"
        disabled={locked || pay.isPending}
        aria-busy={pay.isPending}
        onClick={() => pay.mutate()}
      >
        <CreditCard aria-hidden="true" />
        <span>
          <strong>{ru ? "Картой" : "Card"}</strong>
          <small>{cfg.data.sandbox ? (ru ? "Тестовый режим Xsolla" : "Xsolla test mode") : "Xsolla"}</small>
        </span>
        <b>{price}</b>
        <ArrowRight className="energy-buy__method-arrow" aria-hidden="true" />
      </button>
      {pay.isError && (
        <p className="energy-buy__error" role="alert">
          {humanError(pay.error)}
        </p>
      )}
    </div>
  );
}
