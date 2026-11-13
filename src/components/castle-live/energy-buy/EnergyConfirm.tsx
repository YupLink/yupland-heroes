// Подтверждение, пополнение звёзд и «готово» окна энергии (дизайн Ангелины).
// Перед оплатой всегда видно, что получишь, чем платишь, сколько есть и
// сколько не хватает; не хватает звёзд — пополнение тут же. Золото (вместо
// билетов, §8.61) не покупается — тогда кнопка «Недостаточно средств».
import type { ReactNode } from "react";
import { StarsTopUp } from "@/components/account/StarsTopUp";
import { gameSpent, type PayOpt } from "./energyOffers";
import { PaymentGlyph } from "./energyGlyphs";
import { methodName, num, priceText, tokenName } from "./energyFormat";

export type Reward = { art: ReactNode; title: string; sub?: string };

function BalanceLine({ ru, opt, balance }: { ru: boolean; opt: PayOpt; balance: number | null }) {
  if (balance == null) return null;
  // Копейки округляем по-человечески: 2,07 не превращаем в 2,06 из-за дробей.
  const short = Math.max(0, Math.ceil((opt.price - balance) * 100 - 1e-6) / 100);
  const have = Math.round(balance * 100) / 100;
  const unit = opt.method === "stars" ? "★" : opt.method === "gold" || opt.method === "likes" ? "" : tokenName(opt.token);
  const label =
    opt.method === "stars"
      ? ru ? "В Казне" : "In Treasury"
      : opt.method === "gold"
        ? ru ? "Золота" : "Gold"
        : opt.method === "likes"
          ? ru ? "Лайков" : "Likes"
          : ru ? "На счёте" : "On balance";
  return (
    <p className={opt.method === "stars" ? "energy-buy__stars-balance" : "energy-buy__payment-balance"} role="status">
      {label}: <strong>{num(have, ru)} {unit}</strong>
      {short > 0 && <span>{ru ? "Не хватает" : "Need"} {num(short, ru)} {unit}</span>}
    </p>
  );
}

export function EnergyConfirm({
  ru,
  reward,
  opt,
  balance,
  error,
  pending,
  onPay,
  onTopUp,
}: {
  ru: boolean;
  reward: Reward;
  opt: PayOpt;
  balance: number | null;
  error: string;
  pending: boolean;
  onPay: () => void;
  onTopUp: () => void;
}) {
  const short = balance != null && balance < opt.price;
  const action =
    pending || gameSpent(opt) ? null : !short ? onPay : opt.method === "stars" ? onTopUp : null;
  const label = gameSpent(opt)
    ? ru ? "Лимит на сегодня" : "Today’s limit reached"
    : pending
    ? ru ? "Покупаем…" : "Buying…"
    : short
      ? opt.method === "stars"
        ? ru ? "Пополнить Stars" : "Top up Stars"
        : ru ? "Недостаточно средств" : "Insufficient balance"
      : opt.method === "stars"
        ? ru ? "Оплатить Stars" : "Pay with Stars"
        : ru ? "Подтвердить покупку" : "Confirm purchase";
  return (
    <>
      <div className="energy-buy__confirm-hero">
        <div className="energy-buy__confirm-art" aria-hidden="true">
          {reward.art}
        </div>
        <div className="energy-buy__confirm-reward">
          <strong>{reward.title}</strong>
          {reward.sub && <small>{reward.sub}</small>}
        </div>
      </div>
      <div className="energy-buy__confirm-payment">
        <PaymentGlyph method={opt.method} />
        <span>
          <small>{ru ? "Способ оплаты" : "Payment method"}</small>
          <strong>{methodName(opt, ru)}</strong>
        </span>
        <b>{priceText(opt, ru)}</b>
      </div>
      <BalanceLine ru={ru} opt={opt} balance={balance} />
      {error && (
        <p className="energy-buy__error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="energy-buy__primary" disabled={!action} onClick={() => action?.()}>
        {label}
      </button>
    </>
  );
}

export function EnergyTopUp({ ru, opt, balance, onBack }: { ru: boolean; opt: PayOpt; balance: number | null; onBack: () => void }) {
  const short = balance == null ? undefined : Math.max(0, Math.ceil(opt.price - balance));
  return (
    <>
      <p>
        {ru ? "Для покупки нужно" : "This purchase needs"} {priceText(opt, ru)}.{" "}
        {ru ? "В Казне сейчас" : "Treasury has"} {balance == null ? "—" : num(balance, ru)} ★.
      </p>
      <StarsTopUp neededAmount={short} />
      <button type="button" className="energy-buy__primary" onClick={onBack}>
        {ru ? "Вернуться к покупке" : "Return to purchase"}
      </button>
    </>
  );
}

export function EnergyDone({ ru, title, onBack }: { ru: boolean; title: string; onBack: () => void }) {
  return (
    <>
      <span className="energy-buy__success-glyph">
        <img src="/resources/energy.png" alt="" aria-hidden="true" />
      </span>
      <h3>{ru ? "Покупка завершена" : "Purchase complete"}</h3>
      <p>{title}</p>
      <button type="button" className="energy-buy__primary" onClick={onBack}>
        {ru ? "К пакетам" : "Back to packs"}
      </button>
    </>
  );
}

