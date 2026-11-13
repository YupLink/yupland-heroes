// «Выбери способ оплаты» окна энергии (дизайн Ангелины): для пакета — все
// способы со счёта, для подписки — витрина тарифа и звёзды / USDT / DARAI.
// Звёзды первыми; всё — со счёта Казны, без подписи в кошельке.
import { ArrowRight, Crown } from "lucide-react";
import type { SubOffer } from "@/server/api/energy-sub/tiers";
import { licenseTier } from "@/lib/bankLicense";
import { gameSpent, type PayOpt } from "./energyOffers";
import { EnergyTierGlyph, PaymentGlyph } from "./energyGlyphs";
import { boxesWord, energyWord, methodName, num, priceText } from "./energyFormat";
import { CardPayRow } from "../card-pay/CardPayRow";

const BOX_ART = "/design-assets/purchase/bonus-box.webp";

type ListProps = { ru: boolean; opts: PayOpt[]; onPick: (o: PayOpt) => void; locked?: boolean };

function MethodList({ ru, opts, onPick, locked = false }: ListProps) {
  const stars = opts.filter((o) => o.method === "stars");
  const rest = opts.filter((o) => o.method !== "stars");
  return (
    <div className="energy-buy__methods">
      {stars.map((o) => (
        <button type="button" key={o.key} className="energy-buy__method" disabled={locked || gameSpent(o)} onClick={() => onPick(o)}>
          <PaymentGlyph method="stars" />
          <span>
            <strong>{methodName(o, ru)}</strong>
            <small>{ru ? "Со счёта Казны" : "From Treasury balance"}</small>
          </span>
          <b>{priceText(o, ru)}</b>
          <ArrowRight className="energy-buy__method-arrow" aria-hidden="true" />
        </button>
      ))}
      {rest.length > 0 && (
        <section className="energy-buy__wallet-methods">
          {rest.map((o) => (
            <button type="button" key={o.key} className="energy-buy__method" disabled={locked || gameSpent(o)} onClick={() => onPick(o)}>
              <PaymentGlyph method={o.method} />
              <span>
                <strong>{methodName(o, ru)}</strong>
                <small>{ru ? "Со счёта Казны" : "From Treasury balance"}</small>
              </span>
              <b>{priceText(o, ru)}</b>
              <ArrowRight className="energy-buy__method-arrow" aria-hidden="true" />
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

/** Способы пакета — как в макете: цена крупно, под ней чем платишь. */
export function PackMethods({ ru, opts, onPick }: { ru: boolean; opts: PayOpt[]; onPick: (o: PayOpt) => void }) {
  return (
    <div className="energy-buy__methods">
      <section className="energy-buy__wallet-methods">
        {[...opts].sort((a, b) => Number(b.method === "stars") - Number(a.method === "stars")).map((o) => (
          <button type="button" key={o.key} className="energy-buy__method" disabled={gameSpent(o)} onClick={() => onPick(o)}>
            <PaymentGlyph method={o.method} />
            <span className="energy-buy__method-price">
              <strong>{o.method === "stars" ? `${num(o.price, ru)} ★` : num(o.price, ru)}</strong>
              <span>{methodName(o, ru)}</span>
            </span>
            <ArrowRight className="energy-buy__method-arrow" aria-hidden="true" />
          </button>
        ))}
      </section>
    </div>
  );
}

export function SubMethods({
  ru,
  tier,
  glyph,
  saving,
  opts,
  onPick,
  cardOnly = false,
}: {
  ru: boolean;
  tier: SubOffer;
  glyph: number;
  saving: number | null;
  opts: PayOpt[];
  onPick: (o: PayOpt) => void;
  /** «Только Google» (§8.127): платит только картой. */
  cardOnly?: boolean;
}) {
  const name = !ru && tier.nameEn ? tier.nameEn : tier.name;
  const total = tier.boxesPerDay * tier.days;
  return (
    <>
      <section className="energy-buy__plan-hero" aria-label={`${name} · ${tier.days}`}>
        <EnergyTierGlyph tier={glyph} />
        <div className="energy-buy__plan-hero-copy">
          <h3>
            {name} · {tier.days} {ru ? "дней" : "days"}
          </h3>
          {saving != null && (
            <span className="energy-buy__plan-saving">
              <Crown aria-hidden="true" />
              {ru ? `Выгода до ${saving}%` : `Save up to ${saving}%`}
            </span>
          )}
        </div>
        <img className="energy-buy__plan-box" src={BOX_ART} alt="" aria-hidden="true" />
      </section>
      <div className="energy-buy__plan-benefits">
        <div>
          <img src="/resources/energy.png" alt="" aria-hidden="true" />
          <span>
            <strong>{ru ? "Каждый день" : "Every day"}</strong>
            <small>
              {num(tier.energyPerDay, ru)} {energyWord(ru)}
              {tier.boxesPerDay > 0 && ` · ${tier.boxesPerDay} ${boxesWord(tier.boxesPerDay, ru)}`}
            </small>
          </span>
        </div>
        <div>
          <img src={BOX_ART} alt="" aria-hidden="true" />
          <span>
            <strong>{ru ? `За ${tier.days} дней` : `In ${tier.days} days`}</strong>
            <small>
              {num(tier.energyPerDay * tier.days, ru)} {energyWord(ru)}
              {total > 0 && ` · ${num(total, ru)} ${boxesWord(total, ru)}`}
              {tier.noDecay && (ru ? " · энергия не тает" : " · energy never decays")}
              {tier.licenseTier &&
                (ru
                  ? ` · лицензия банка «${licenseTier(tier.licenseTier)?.ru}»`
                  : ` · bank license “${licenseTier(tier.licenseTier)?.en}”`)}
              {tier.withdrawBonus > 0 &&
                (ru
                  ? ` · +${num(tier.withdrawBonus / 1_000_000, ru)} млн DARAI к выводу в месяц`
                  : ` · +${num(tier.withdrawBonus / 1_000_000, ru)}M DARAI withdrawal per month`)}
            </small>
          </span>
        </div>
      </div>
      <h3 className="energy-buy__payment-heading">{ru ? "Выбери способ оплаты" : "Choose a payment method"}</h3>
      {/* Одна подписка за раз (esub-07): своя действует — оплата закрыта до её конца. */}
      {tier.blockedUntil && (
        <p className="energy-buy__error" role="status">
          {ru ? "Подписка активна до" : "Subscription active until"}{" "}
          {new Date(tier.blockedUntil).toLocaleDateString(ru ? "ru-RU" : "en-GB")}
        </p>
      )}
      {/* Картой — только «только Google» (§8.127), сервер решает. */}
      <CardPayRow sku={tier.id} usd={tier.priceUsd} ru={ru} locked={!!tier.blockedUntil} offText={cardOnly} />
      <MethodList ru={ru} opts={opts} onPick={onPick} locked={!!tier.blockedUntil} />
    </>
  );
}

