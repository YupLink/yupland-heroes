// Значки окна «Купить энергию» (дизайн Ангелины): способ оплаты и тариф подписки.
import { Crown, Wallet } from "lucide-react";
import type { PayOpt } from "./energyOffers";

export function PaymentGlyph({ method }: { method: PayOpt["method"] }) {
  return (
    <span className="energy-buy__payment-glyph" aria-hidden="true">
      {method === "tickets" || method === "likes" ? (
        <img src={`/resources/${method}.png`} alt="" />
      ) : method === "stars" ? (
        "★"
      ) : (
        <Wallet />
      )}
    </span>
  );
}

/** Значок тарифа: одна молния, две, у старшего — корона над молнией. */
export function EnergyTierGlyph({ tier }: { tier: number }) {
  const t = Math.min(2, Math.max(0, tier));
  return (
    <span className={`energy-buy__energy-bundle energy-buy__energy-bundle--${t}`} aria-hidden="true">
      {t === 2 ? (
        <svg className="energy-buy__expert-emblem" viewBox="0 0 100 100" focusable="false" aria-hidden="true">
          <path d="M8 67 12 61 16 67 12 73Z M84 27 88 21 92 27 88 33Z" fill="#ffe694" />
          <Crown x={22} y={3} width={56} height={39} fill="#efb632" stroke="#ffe076" strokeWidth={2.5} />
          <image href="/resources/energy.png" x={28} y={41} width={44} height={52} />
        </svg>
      ) : (
        Array.from({ length: t === 1 ? 2 : 1 }, (_, i) => <img key={i} src="/resources/energy.png" alt="" />)
      )}
    </span>
  );
}
