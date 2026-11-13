import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { SubOffer } from "@/server/api/energy-sub/tiers";
import { boxesWord, energyWord, num } from "./energyFormat";

const BOX = "/design-assets/purchase/bonus-box.webp";
const ART = "/design-assets/purchase/subscription-packs/";

function artFor(id: string): string {
  if (id === "esub_novice") return `${ART}beginner.png`;
  if (id === "esub_advanced") return `${ART}advanced.png`;
  if (id === "esub_expert") return `${ART}expert.png`;
  if (id === "esub_ultra") return `${ART}ultra-plus.png`;
  return "/resources/energy.png";
}

function name(t: SubOffer, ru: boolean) {
  return !ru && t.nameEn ? t.nameEn : t.name;
}

function BoxCount({ count, ru }: { count: number; ru: boolean }) {
  return <span className="energy-sub-ab__boxes"><img src={BOX} alt="" aria-hidden="true" />{num(count, ru)} {boxesWord(count, ru)}</span>;
}

function Daily({ t, ru }: { t: SubOffer; ru: boolean }) {
  return <span className="energy-sub-ab__reward-line"><span>{num(t.energyPerDay, ru)} {energyWord(ru)} +</span><span className="energy-sub-ab__box-period"><BoxCount count={t.boxesPerDay} ru={ru} />{ru ? "в день" : "daily"}</span></span>;
}

function CompactDaily({ t, ru }: { t: SubOffer; ru: boolean }) {
  return <>{num(t.energyPerDay, ru)} {energyWord(ru)}<br /><span className="energy-sub-ab__box-period"><BoxCount count={t.boxesPerDay} ru={ru} />{ru ? "в день" : "daily"}</span></>;
}

function Hit({ ru, ribbon = false }: { ru: boolean; ribbon?: boolean }) {
  return ribbon && ru
    ? <img className="energy-sub-ab__hit-ribbon" src={`${ART}hit-ribbon.png`} alt="" aria-hidden="true" />
    : <span className="energy-sub-ab__hit" aria-hidden="true">{ru ? "ХИТ" : "HIT"}</span>;
}

type Props = {
  tiers: SubOffer[];
  ru: boolean;
  layout: "vertical" | "horizontal";
  onTier: (index: number) => void;
  /** «Только Google» (§8.127): цена в $ — платит картой. */
  dollars?: boolean;
};

export function SubscriptionVariants({ tiers, ru, layout, onTier, dollars = false }: Props) {
  const price = (t: SubOffer) => (dollars ? "$" + num(t.priceUsd, ru) : num(t.priceUsd, ru) + " USDT");
  const expert = tiers.findIndex((t) => t.id === "esub_expert");
  const [selectedId, setSelectedId] = useState<string | null>(expert >= 0 ? tiers[expert].id : tiers[0]?.id ?? null);
  const activeIndex = tiers.findIndex((t) => t.id === selectedId);
  const selected = layout === "horizontal" && activeIndex < 0 ? 0 : activeIndex;
  const active = tiers[layout === "horizontal" ? selected : 0];
  if (!active) return null;

  if (layout === "horizontal") return <div className="energy-sub-ab energy-sub-ab--horizontal">
    <div className="energy-sub-ab__choices" role="group" aria-label={ru ? "Тарифы подписки" : "Subscription plans"}>
      {tiers.map((t, i) => <button key={t.id} type="button" className={`energy-sub-ab__choice${i === selected ? " energy-sub-ab__choice--active" : ""}`}
        aria-pressed={i === selected} aria-label={`${name(t, ru)}, ${price(t)}${t.id === "esub_expert" ? ru ? ", хит" : ", hit" : ""}`}
        onClick={() => setSelectedId(t.id)}>
        {t.id === "esub_expert" && <Hit ru={ru} />}
        <img src={artFor(t.id)} alt="" aria-hidden="true" />
        <strong>{t.id === "esub_advanced" ? "PRO" : name(t, ru)}</strong>
        <span>{price(t)}</span>
      </button>)}
    </div>
    <section className="energy-sub-ab__detail" aria-live="polite" aria-label={ru ? `Тариф ${name(active, ru)}` : `${name(active, ru)} plan`}>
      <img className="energy-sub-ab__hero" src={artFor(active.id)} alt="" aria-hidden="true" />
      <h4>{name(active, ru)}</h4>
      <p><Daily t={active} ru={ru} /></p>
      <div className="energy-sub-ab__monthly">
        <small>{ru ? `За ${active.days} дней` : `Over ${active.days} days`}</small>
        <strong>{num(active.energyPerDay * active.days, ru)} {energyWord(ru)}</strong>
        <strong>+ <BoxCount count={active.boxesPerDay * active.days} ru={ru} /></strong>
      </div>
      {active.blockedUntil && <p className="energy-sub-ab__blocked">{ru ? "Такая подписка уже действует" : "This plan is already active"}</p>}
      <button type="button" className="energy-sub-ab__choose" disabled={!!active.blockedUntil} onClick={() => onTier(selected)}>{ru ? "Выбери способ оплаты" : "Choose a payment method"}<ArrowRight aria-hidden="true" /></button>
    </section>
  </div>;

  return <div className="energy-sub-ab energy-sub-ab--vertical">
    {tiers.map((t, i) => {
      const expanded = i === selected;
      const hit = t.id === "esub_expert";
      return <article key={t.id} className={`energy-sub-ab__row${expanded ? " energy-sub-ab__row--expanded" : ""}${hit ? " energy-sub-ab__row--expert" : ""}`}>
        <button type="button" className="energy-sub-ab__toggle" aria-expanded={expanded} aria-controls={expanded ? `energy-sub-ab-detail-${t.id}` : undefined}
          onClick={() => setSelectedId(expanded ? null : t.id)}>
          <img src={artFor(t.id)} alt="" aria-hidden="true" />
          <span className="energy-sub-ab__summary"><strong>{name(t, ru)}</strong>{!expanded && <small><CompactDaily t={t} ru={ru} /></small>}</span>
          <b>{price(t)}</b><ArrowRight aria-hidden="true" />
          {hit && <span className="sr-only">{ru ? "Хит" : "Hit"}</span>}
        </button>
        {hit && <Hit ru={ru} ribbon />}
        {expanded && <div className="energy-sub-ab__expanded" id={`energy-sub-ab-detail-${t.id}`}>
          <div><img src="/resources/energy.png" alt="" aria-hidden="true" /><Daily t={t} ru={ru} /></div>
          <div><svg className="energy-sub-ab__calendar" viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false"><rect x="3.5" y="6.5" width="25" height="22" rx="3" fill="#211a11" stroke="#f6c451" strokeWidth="2.5" strokeLinecap="round" /><path d="M4 13h24M10 3v7M22 3v7" stroke="#f6c451" strokeWidth="2.5" strokeLinecap="round" /><path d="M9 17h3v3H9zm6 0h3v3h-3zm6 0h3v3h-3zM9 23h3v3H9zm6 0h3v3h-3zm6 0h3v3h-3z" fill="#f6c451" /></svg><span className="energy-sub-ab__reward-line"><span>{num(t.energyPerDay * t.days, ru)} {energyWord(ru)} +</span><span className="energy-sub-ab__box-period"><BoxCount count={t.boxesPerDay * t.days} ru={ru} />{ru ? `за ${t.days} дней` : `over ${t.days} days`}</span></span></div>
          {t.blockedUntil && <p className="energy-sub-ab__blocked">{ru ? "Такая подписка уже действует" : "This plan is already active"}</p>}
          <button type="button" className="energy-sub-ab__choose" disabled={!!t.blockedUntil} onClick={() => onTier(i)}>{ru ? "Выбери способ оплаты" : "Choose a payment method"}<ArrowRight aria-hidden="true" /></button>
        </div>}
      </article>;
    })}
  </div>;
}
