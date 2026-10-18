// Каталог окна «Купить энергию» (дизайн Ангелины): витрина подписки с тарифами
// и разовые пакеты. Stars — золотой основной кнопкой, если доступны.
// Остальные цены — две видимые и +N для полного списка.
import { useRef } from "react";
import { ArrowDown, ArrowRight, Crown } from "lucide-react";
import type { MySub, SubOffer } from "@/server/api/energy-sub/tiers";
import { gameSpent, type PackCard, type PayOpt } from "./energyOffers";
import { EnergyTierGlyph } from "./energyGlyphs";
import { boxesWord, compactDarai, energyWord, num, priceText, tierGlyph, tokenName } from "./energyFormat";

const BOX_ART = "/design-assets/purchase/bonus-box.webp";

function BenefitBadge({ ru, boxes }: { ru: boolean; boxes: number }) {
  const boxText = ru ? `До ${num(boxes, ru)} боксов` : `Up to ${num(boxes, ru)} boxes`;
  return (
    <span className="energy-buy__subscription-saving">
      <Crown aria-hidden="true" />
      <span>{boxText}</span>
    </span>
  );
}

type Props = {
  ru: boolean;
  walletView: boolean;
  cards: PackCard[];
  tiers: SubOffer[];
  mine: MySub[];
  savings: (number | null)[];
  busyKey: string | null;
  onTier: (index: number) => void;
  onGame: (card: PackCard) => void;
  onPrice: (card: PackCard, o: PayOpt) => void;
  onAll: (card: PackCard) => void;
};

export function EnergyCatalog({ ru, walletView, cards, tiers, mine, savings, busyKey, onTier, onGame, onPrice, onAll }: Props) {
  const subscriptionsRef = useRef<HTMLHeadingElement>(null);
  const packsRef = useRef<HTMLHeadingElement>(null);
  const jumpTo = (target: HTMLHeadingElement | null) => {
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "start" });
  };
  const known = savings.filter((s): s is number => s != null);
  const bestSaving = known.length ? Math.max(...known) : null;
  const comparisonPack = cards
    .flatMap((c) => c.others.filter((o) => o.token === "USDT").map((o) => ({ amount: c.amount, price: o.price })))
    .sort((a, b) => b.amount - a.amount)[0];
  const maxBoxes = Math.max(0, ...tiers.map((t) => t.boxesPerDay * t.days));
  const tierName = (t: SubOffer) => (!ru && t.nameEn ? t.nameEn : t.name);
  const days = tiers[0]?.days ?? 30;
  const last = tiers.length - 1;
  const lastLabel =
    tiers.length >= 3 && walletView && bestSaving != null && savings[last] === bestSaving
      ? ru ? "МАКСИМУМ ВЫГОДЫ" : "BEST VALUE"
      : tiers.length >= 3 && tiers[last].boxesPerDay * tiers[last].days === maxBoxes && maxBoxes > 0
        ? ru ? "БОЛЬШЕ ВСЕГО БОКСОВ" : "MOST BOXES"
        : null;

  return (
    <>
      {tiers.length > 0 && cards.length > 0 && (
        <nav className="energy-buy__section-nav" aria-label={ru ? "Виды покупки энергии" : "Energy purchase types"}>
          <button type="button" onClick={() => jumpTo(packsRef.current)}>
            {ru ? "Разовые пакеты" : "One-time packs"}
          </button>
          <button type="button" onClick={() => jumpTo(subscriptionsRef.current)}>
            {ru ? "Подписка" : "Subscription"}
          </button>
        </nav>
      )}
      {tiers.length > 0 && (
        <section className="energy-buy__subscription-section energy-buy__subscription-section--featured">
          <div className="energy-buy__subscription-feature">
            <div className="energy-buy__subscription-feature-copy">
              <h3 ref={subscriptionsRef} tabIndex={-1}>{ru ? `Подписка на ${days} дней` : `${days}-day subscription`}</h3>
              <BenefitBadge ru={ru} boxes={maxBoxes} />
              <p>{ru ? "Энергия и бонусные боксы каждый день" : "Energy and bonus boxes every day"}</p>
            </div>
            <span className="energy-buy__sparkle energy-buy__sparkle--left" aria-hidden="true">✦</span>
            <span className="energy-buy__sparkle energy-buy__sparkle--top" aria-hidden="true">✦</span>
            <span className="energy-buy__sparkle energy-buy__sparkle--right" aria-hidden="true">✦</span>
            <img src={BOX_ART} alt="" aria-hidden="true" />
          </div>
          <div className="energy-buy__subscriptions">
            {tiers.map((t, i) => (
              <button
                type="button"
                key={t.id}
                className={`energy-buy__tier${tierGlyph(i, tiers.length) === 2 ? " energy-buy__tier--expert" : ""}`}
                onClick={() => onTier(i)}
              >
                <EnergyTierGlyph tier={tierGlyph(i, tiers.length)} />
                <span className="energy-buy__tier-main">
                  <span className="energy-buy__tier-heading">
                    <strong>{tierName(t)}</strong>
                    {walletView && savings[i] != null && <span className="energy-buy__tier-saving">−{savings[i]}%</span>}
                    {i === last && lastLabel && <span className="energy-buy__expert-label">{lastLabel}</span>}
                    <ArrowRight aria-hidden="true" />
                  </span>
                  <span className="energy-buy__tier-daily">
                    {num(t.energyPerDay, ru)} {energyWord(ru)}
                    {t.boxesPerDay > 0 && ` + ${t.boxesPerDay} ${boxesWord(t.boxesPerDay, ru)}`}
                    {ru ? "/день" : "/day"}
                  </span>
                </span>
                <span className="energy-buy__tier-prices">
                  {t.prices.STARS != null && <span>{num(t.prices.STARS, ru)} ★</span>}
                  {walletView && t.prices.USDT != null && <span>{num(t.prices.USDT, ru)} USDT</span>}
                  {walletView && t.prices.Darai != null && <span>≈ {compactDarai(t.prices.Darai, ru)} DarAi</span>}
                </span>
              </button>
            ))}
          </div>
          {walletView && bestSaving != null && comparisonPack && (
            <p className="energy-buy__saving-explanation">
              {ru
                ? `Выгода по сравнению с разовым паком +${num(comparisonPack.amount, ru)} энергии за ${num(comparisonPack.price, ru)} USDT; боксы не учитываются.`
                : `Savings compared with the one-time +${num(comparisonPack.amount, ru)} energy pack for ${num(comparisonPack.price, ru)} USDT; boxes excluded.`}
            </p>
          )}
          {mine.map((m) => (
            <p key={m.id} className="energy-buy__saving-basis">
              {ru ? "Активна" : "Active"}: {m.tierName} · {ru ? "до" : "until"}{" "}
              {new Date(m.endsAt).toLocaleDateString(ru ? "ru-RU" : "en-GB")} · {m.daysGiven}/{m.days}
            </p>
          ))}
        </section>
      )}
      {cards.length > 0 && (
        <section className="energy-buy__one-time">
          <h3 ref={packsRef} tabIndex={-1}>
            {ru ? "Разовые пакеты" : "One-time packs"}
            <ArrowDown aria-hidden="true" />
          </h3>
          <div className="energy-buy__offers">
            {cards.map((card) => {
              const game = card.game;
              const stars = card.others.find((o) => o.method === "stars");
              const primary = stars ?? game;
              const spent = gameSpent(primary);
              const alternatives = [...(stars && game ? [game] : []), ...card.others.filter((o) => o.key !== primary?.key)];
              // Звездочнику — сначала звёзды: в превью одна цена, остальное за стрелкой.
              const shown = alternatives.slice(0, walletView ? 2 : 1);
              const all = alternatives.length > shown.length;
              return (
                <article
                  key={card.id}
                  className={`energy-buy__pack-card${shown.length ? " energy-buy__pack-card--with-other" : ""}${primary ? "" : " energy-buy__pack-card--no-game"}`}
                >
                  <span className="energy-buy__pack-glyph">
                    <img src="/resources/energy.png" alt="" aria-hidden="true" />
                  </span>
                  <span className="energy-buy__pack-copy">
                    <strong>+{num(card.amount, ru)} {energyWord(ru)}</strong>
                    {card.discount > 0 && (
                      <small>{ru ? <>Выгода {card.discount}%<br />за единицу</> : `Save ${card.discount}% per unit`}</small>
                    )}
                  </span>
                  <span className="energy-buy__pack-stones" aria-hidden="true" />
                  {primary && (
                    <button
                      type="button"
                      className="energy-buy__pack-buy"
                      aria-label={`${ru ? "Купить" : "Buy"} +${num(card.amount, ru)} ${energyWord(ru)} ${ru ? "за" : "for"} ${priceText(primary, ru)}`}
                      disabled={spent || busyKey != null}
                      onClick={() => primary === game ? onGame(card) : onPrice(card, primary)}
                    >
                      {spent ? (
                        ru ? "Лимит на сегодня" : "Today's limit reached"
                      ) : busyKey === primary.key ? (
                        "…"
                      ) : (
                        <>
                          <span className="energy-buy__pack-buy-prefix">{ru ? "Купить за" : "Buy for"}</span> {num(primary.price, ru)}
                          {primary.method === "stars" ? <span aria-hidden="true">★</span> : <img src={`/resources/${primary.method}.png`} alt="" aria-hidden="true" />}
                        </>
                      )}
                    </button>
                  )}
                  {shown.length > 0 && (
                    <span
                      className={`energy-buy__pack-prices energy-buy__pack-prices--${shown.length}${all ? " energy-buy__pack-prices--with-menu" : ""}`}
                    >
                      {shown.map((o) => (
                        <button
                          key={o.key}
                          type="button"
                          className="energy-buy__pack-preview-price"
                          disabled={busyKey != null || gameSpent(o)}
                          onClick={() => onPrice(card, o)}
                        >
                          <b>{num(o.price, ru)}</b>
                          <span className="energy-buy__pack-preview-method">{o.method === "stars" ? "★ Stars" : o.method === "tickets" ? (ru ? "Билеты" : "Tickets") : o.method === "likes" ? (ru ? "Лайки" : "Likes") : tokenName(o.token)}</span>
                        </button>
                      ))}
                      {all && (
                        <button
                          type="button"
                          className="energy-buy__pack-all-methods"
                          aria-label={ru ? `Все способы оплаты для +${card.amount} энергии` : `All payment methods for +${card.amount} energy`}
                          onClick={() => onAll(card)}
                        >
                          {ru ? "Ещё" : "More"} {alternatives.length - shown.length}
                        </button>
                      )}
                    </span>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
