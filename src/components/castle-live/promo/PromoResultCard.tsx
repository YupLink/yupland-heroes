// Карточка ввода промокода: что выпало, сколько и куда легло (владелец,
// 29.10.2026: «сообщить что получил и куда легло… прям красиво»).
import { useEffect, useRef } from "react";
import {
  Archive,
  Backpack,
  Clock,
  Dices,
  Gift,
  HandCoins,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { thumb } from "@/lib/image";
import type { PromoWhere } from "@/lib/promo/promoTypes";
import {
  WHERE_KEY,
  promoAmountText,
  promoItemImage,
  promoItemName,
  type PromoOutcome,
} from "./promoView";
import { PROMO_KIND_ICON } from "./promoKindIcon";
import "./promo.css";

const WHERE_ICON: Record<PromoWhere, LucideIcon> = {
  balance: Wallet,
  backpack: Backpack,
  inventory: Archive,
  harvest: HandCoins,
  pending: Clock,
};

export function PromoResultCard({
  outcome,
  onDone,
}: {
  outcome: PromoOutcome;
  onDone: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const done = useRef<HTMLButtonElement>(null);
  // Фокус на «Готово»: с клавиатуры и читалкой экрана карточка сразу в руках.
  useEffect(() => done.current?.focus(), []);
  return (
    <section className="promo-card" role="status" aria-live="polite" data-promo-result>
      <header className="promo-card__head">
        <span className="promo-card__seal" aria-hidden="true">
          <Gift />
        </span>
        <div className="min-w-0">
          <h3 className="promo-card__title">{t("promo.got")}</h3>
          {outcome.code && <span className="promo-card__code">{outcome.code}</span>}
        </div>
      </header>
      {outcome.items.length > 0 ? (
        <ul className="promo-card__list">
          {outcome.items.map((it, i) => {
            const src = promoItemImage(it);
            const { Icon, tint } = PROMO_KIND_ICON[it.kind];
            const Where = WHERE_ICON[it.where];
            return (
              <li key={`${it.kind}:${it.ref ?? ""}:${i}`} className="promo-card__item">
                <span className="promo-card__icon" data-kind={it.kind} aria-hidden="true">
                  {src ? <img src={thumb(src, 96)} alt="" loading="lazy" /> : <Icon className={tint} />}
                </span>
                <span className="promo-card__body">
                  <span className="promo-card__name">{promoItemName(it, t)}</span>
                  <span className="promo-card__where" data-where={it.where}>
                    <Where aria-hidden="true" />
                    {t(WHERE_KEY[it.where])}
                  </span>
                </span>
                <b className="promo-card__amount">{promoAmountText(it, lang)}</b>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="promo-card__empty">
          <Dices aria-hidden="true" />
          {t("promo.nothing")}
        </p>
      )}
      <button
        ref={done}
        type="button"
        data-game-button="secondary"
        className="promo-card__done"
        onClick={onDone}
      >
        {t("promo.done")}
      </button>
    </section>
  );
}
