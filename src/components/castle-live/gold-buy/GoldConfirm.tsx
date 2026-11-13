// Экраны окна «Купить золото» после каталога (дизайн Ангелины): все способы
// оплаты пакета, подтверждение (что получишь, чем платишь, сколько есть и не
// хватает), пополнение звёзд и «готово» с золотом, которое зачислил сервер.
import { ArrowRight } from "lucide-react";
import { StarsTopUp } from "@/components/account/StarsTopUp";
import { GoldAmount } from "./GoldCatalog";
import { PaymentGlyph } from "../energy-buy/energyGlyphs";
import { goldArtSrc, goldShortfall } from "@/lib/goldShop";
import type { GoldToken } from "@/lib/goldShop";
import {
  blockHint,
  confirmBlock,
  num,
  priceText,
  tokenLabel,
  tokenUnit,
  type GoldCard,
  type GoldOpt,
  type PayRules,
} from "./goldBuyModel";

const glyph = (token: GoldToken) => (token === "STARS" ? "stars" : "token");

export function GoldMethods({ ru, card, balanceOf, onPick }: {
  ru: boolean;
  card: GoldCard;
  balanceOf: (t: GoldToken) => number | null;
  onPick: (o: GoldOpt) => void;
}) {
  return (
    <div className="energy-buy__methods">
      {card.opts.map((o) => {
        const have = balanceOf(o.token);
        const short = have != null && goldShortfall(o.price, have) > 0;
        return (
          <button type="button" key={o.key} className="energy-buy__method" onClick={() => onPick(o)}>
            <PaymentGlyph method={glyph(o.token)} />
            <span>
              <strong>{tokenLabel(o.token, ru)}</strong>
              <small>
                {have == null
                  ? ru ? "Со счёта Казны" : "From Treasury balance"
                  : `${ru ? "На счёте" : "Balance"}: ${num(have, ru)} ${tokenUnit(o.token)}${short ? (ru ? " · не хватает" : " · not enough") : ""}`}
              </small>
            </span>
            <b>{priceText(o, ru)}</b>
            <ArrowRight className="energy-buy__method-arrow" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

export function GoldConfirm({ ru, card, opt, balance, starOnly, rules, error, pending, onPay, onTopUp, onRetryBalance }: {
  ru: boolean;
  card: GoldCard;
  opt: GoldOpt;
  balance: number | null;
  starOnly: boolean;
  rules: PayRules;
  error: string;
  pending: boolean;
  onPay: () => void;
  onTopUp: () => void;
  onRetryBalance: () => void;
}) {
  const block = confirmBlock(opt, balance, pending);
  const stars = opt.token === "STARS";
  const action = block == null ? onPay : block === "short" && stars ? onTopUp : null;
  const label =
    block === "pending"
      ? ru ? "Покупаем…" : "Buying…"
      : block === "short"
        ? stars ? (ru ? "Пополнить Stars" : "Top up Stars") : ru ? "Недостаточно средств" : "Insufficient balance"
        : block === "unknown"
          ? ru ? "Проверяем баланс…" : "Checking balance…"
          : block
            ? ru ? "Оплата недоступна" : "Payment unavailable"
            : error
              ? ru ? "Повторить" : "Try again"
              : stars ? (ru ? "Оплатить Stars" : "Pay with Stars") : ru ? "Подтвердить покупку" : "Confirm purchase";
  const short = goldShortfall(opt.price, balance);
  const hint = blockHint(block, opt.token, ru, starOnly, rules);
  return (
    <>
      <div className="energy-buy__confirm-hero">
        <div className="energy-buy__confirm-art" aria-hidden="true">
          <img src={goldArtSrc(card.offer.gold)} alt="" />
        </div>
        <div className="energy-buy__confirm-reward">
          <strong><GoldAmount gold={card.offer.gold} ru={ru} /></strong>
          {card.offer.discountPct > 0 && <small className="gold-buy__confirm-discount">−{card.offer.discountPct}%</small>}
        </div>
      </div>
      <div className="energy-buy__confirm-payment">
        <PaymentGlyph method={glyph(opt.token)} />
        <span>
          <small>{ru ? "Способ оплаты" : "Payment method"}</small>
          <strong>{tokenLabel(opt.token, ru)}</strong>
        </span>
        <b>{priceText(opt, ru)}</b>
      </div>
      {balance != null && (
        <p className={stars ? "energy-buy__stars-balance" : "energy-buy__payment-balance"} role="status">
          {stars ? (ru ? "В Казне" : "In Treasury") : ru ? "На счёте" : "On balance"}:{" "}
          <strong>{num(balance, ru)} {tokenUnit(opt.token)}</strong>
          {short > 0 && <span>{ru ? "Не хватает" : "Need"} {num(short, ru)} {tokenUnit(opt.token)}</span>}
        </p>
      )}
      {block === "unknown" && !pending && (
        <p className="energy-buy__payment-balance" role="status">
          <button type="button" className="gold-buy__link" onClick={onRetryBalance}>
            {ru ? "Обновить баланс" : "Refresh balance"}
          </button>
        </p>
      )}
      {hint && <p className="energy-buy__payment-balance gold-buy__hint">{hint}</p>}
      {error && <p className="energy-buy__error" role="alert">{error}</p>}
      <button type="button" className="energy-buy__primary" disabled={!action} aria-busy={pending} onClick={() => action?.()}>
        {label}
      </button>
    </>
  );
}

export function GoldTopUp({ ru, opt, balance, onBack }: { ru: boolean; opt: GoldOpt; balance: number | null; onBack: () => void }) {
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

export function GoldDone({ ru, gold, onBack }: { ru: boolean; gold: number; onBack: () => void }) {
  return (
    <>
      <span className="energy-buy__success-glyph">
        <img src={goldArtSrc(gold)} alt="" aria-hidden="true" />
      </span>
      <h3>{ru ? "Покупка завершена" : "Purchase complete"}</h3>
      <p><GoldAmount gold={gold} ru={ru} /></p>
      <small className="gold-buy__done-note">{ru ? "Золото зачислено." : "Gold added."}</small>
      <button type="button" className="energy-buy__primary" onClick={onBack}>
        {ru ? "К пакетам" : "Back to packs"}
      </button>
    </>
  );
}
