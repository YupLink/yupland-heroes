// Каталог «Купить золото» (дизайн Ангелины, 20.10.2026): витрина-баннер и
// карточки пакетов. Картинка — по количеству (мешочек, два, сундук,
// переполненный сундук), число всегда написано рядом; метка скидки — у пакета.
// Stars — золотой кнопкой, USDT и DarAi — строкой ниже; карточка целиком
// открывает все способы оплаты с балансами.
import { ArrowRight } from "lucide-react";
import { goldArtSrc } from "@/lib/goldShop";
import { goldTitle, num, tokenLabel, type GoldCard, type GoldOpt } from "./goldBuyModel";

export function GoldAmount({ gold, ru }: { gold: number; ru: boolean }) {
  return <span className="gold-buy__amount" role="img" aria-label={goldTitle(gold, ru)}><span aria-hidden="true">+{num(gold, ru)}</span><img src="/resources/gold.webp" alt="" aria-hidden="true" /></span>;
}

type Props = {
  ru: boolean;
  cards: GoldCard[];
  busy: boolean;
  onPick: (card: GoldCard, opt: GoldOpt) => void;
  onAll: (card: GoldCard) => void;
  /** Оплата картой открыта (§8.127): цена в $ золотой кнопкой — к способам оплаты. */
  cardOn?: boolean;
};

function Card({ ru, card, busy, onPick, onAll, cardOn = false }: Omit<Props, "cards"> & { card: GoldCard }) {
  const { offer } = card;
  const title = goldTitle(offer.gold, ru);
  const stars = card.opts.find((o) => o.token === "STARS");
  const alts = card.opts.filter((o) => o !== stars);
  const buyFor = (o: GoldOpt) =>
    `${ru ? "Купить" : "Buy"} ${title} ${ru ? "за" : "for"} ${num(o.price, ru)} ${o.token === "STARS" ? "Stars" : tokenLabel(o.token, ru)}`;
  return (
    <article className={`gold-buy__card${stars || cardOn ? "" : " gold-buy__card--no-stars"}`}>
      <button
        type="button"
        className={`gold-buy__card-head${offer.discountPct > 0 ? "" : " gold-buy__card-head--plain"}`}
        disabled={busy}
        aria-label={`${title}. ${ru ? "Все способы оплаты" : "All payment methods"}`}
        onClick={() => onAll(card)}
      >
        <span className="gold-buy__bundle" aria-hidden="true">
          <img src={goldArtSrc(offer.gold)} alt="" />
        </span>
        <strong><GoldAmount gold={offer.gold} ru={ru} /></strong>
        {offer.discountPct > 0 && (
          <em className="gold-buy__discount" title={ru ? "Скидка к пакету 100 золота за $1" : "Saving vs 100 gold for $1"}>
            −{offer.discountPct}%
          </em>
        )}
      </button>
      {cardOn && !stars && (
        <button
          type="button"
          className="gold-buy__stars"
          disabled={busy}
          aria-label={`${title}. ${ru ? "Картой" : "Card"} $${num(offer.priceUsd, ru)}`}
          onClick={() => onAll(card)}
        >
          <b>${num(offer.priceUsd, ru)}</b>
          <ArrowRight aria-hidden="true" />
        </button>
      )}
      {stars && (
        <button type="button" className="gold-buy__stars" disabled={busy} aria-label={buyFor(stars)} onClick={() => onPick(card, stars)}>
          <b>{num(stars.price, ru)} ★</b>
          <ArrowRight aria-hidden="true" />
        </button>
      )}
      {alts.length > 0 && (
        <div className={`gold-buy__alts gold-buy__alts--${alts.length}`}>
          {alts.map((o) => (
            <button key={o.key} type="button" className="gold-buy__alt" disabled={busy} aria-label={buyFor(o)} onClick={() => onPick(card, o)}>
              <span>
                <b>{num(o.price, ru)}</b>
                <small>{tokenLabel(o.token, ru)}</small>
              </span>
              <ArrowRight aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

export function GoldCatalog({ ru, cards, busy, onPick, onAll, cardOn = false }: Props) {
  return (
    <>
      <div className="gold-buy__feature">
        <div className="gold-buy__feature-copy">
          <h3>{ru ? "Запас золота" : "Gold reserve"}</h3>
          <p>{ru ? "Выбери нужный запас" : "Choose your amount"}</p>
        </div>
      </div>
      <div className="gold-buy__offers">
        {cards.map((card) => (
          <Card key={card.offer.id} ru={ru} card={card} busy={busy} onPick={onPick} onAll={onAll} cardOn={cardOn} />
        ))}
      </div>
    </>
  );
}
