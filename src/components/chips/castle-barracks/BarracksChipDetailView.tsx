import { ArrowUp, ChevronRight, Crown, Info, X } from "lucide-react";
import { ChipImage } from "@/components/ChipImage";
import { ChipBusyBadge, ChipBusyNotice, chipBusyImageClass } from "@/components/chips/ChipBusyNotice";
import type { ChipBusyView } from "@/components/chips/chipBusy";
import { labelForLevel } from "@/components/chips/levelLabel";
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";
import { useLang, useT } from "@/lib/i18n";
import { upgradeBlockText, type ChipUpgradeState } from "@/lib/chips/upgradeBlock";
import { hpOf, powerOf } from "@/lib/chipStats";
import { craftPathFrom, CRAFT_PATH, CRAFT_TOTALS } from "@/lib/craftPath";
import { craftGoldTotal, fmtGold, goldAtMultiplier } from "@/lib/craftGold";
import { tirageBonus } from "@/lib/tirageBonus";
import { GoldRequiredLine, goldShort } from "@/components/chips/GoldPriceLine";

type Props = {
  template: { name: string; collectionName: string; imageUrl: string; templateNo: number };
  chip: { level: number; serialNo: number | null };
  supply: number | null | undefined;
  isPremium: boolean;
  bonusEnabled: boolean | undefined;
  bonusError: boolean;
  onBonusRetry: () => void;
  busy: ChipBusyView | null;
  resting: boolean;
  restLeft: string;
  isMax: boolean;
  /** Цена улучшения в золоте по текущему курсу; null — нет правил или цена ещё грузится. */
  upgradeCost: number | null;
  /** Множитель цены к стандарту (с сервера); null — пока неизвестен. */
  goldMult: number | null;
  /** Золото на счёте; null — пока неизвестно. */
  haveGold: number | null;
  upgradeState?: ChipUpgradeState;
  heroLikes: number | null;
  /** «Продать в Маркете» за золото (с 21.10.2026); занятую фишку не выставить. */
  sellDisabled: boolean;
  onCraft: () => void;
  onHero: () => void;
  onSell: () => void;
  onClose: () => void;
};

export function BarracksChipDetailView({
  template, chip, supply, isPremium, bonusEnabled, bonusError, onBonusRetry,
  busy, resting, restLeft, isMax, upgradeCost, goldMult, haveGold, upgradeState, heroLikes,
  sellDisabled, onCraft, onHero, onSell, onClose,
}: Props) {
  const ru = useLang() === "ru";
  const t = useT();
  // Не хватает золота: по пакетной проверке (цена с автоподбором) или по цене шага и балансу.
  const goldBlock = upgradeState && !upgradeState.can && upgradeState.reason.kind === "gold" ? upgradeState.reason : null;
  const goldNeed = goldBlock?.need ?? upgradeCost;
  const goldHave = goldBlock?.have ?? haveGold;
  const noGold = goldShort(goldNeed, goldHave);
  const upgradeReason = upgradeState && !upgradeState.can && !goldBlock ? upgradeBlockText(upgradeState.reason, t) : null;
  const [lo, hi] = powerOf(chip.level);
  const baseLife = hpOf(chip.level);
  const bonus = tirageBonus(supply ?? null, isPremium);
  const attackMult = bonusEnabled ? bonus.atkMult : 1;
  const lifeMult = bonusEnabled ? bonus.hpMult : 1;
  const fmt = (value: number) => value.toLocaleString(ru ? "ru-RU" : "en-US");
  const attack = bonusEnabled === undefined ? "…" : `${fmt(Math.round(lo * attackMult))}–${fmt(Math.round(hi * attackMult))}`;
  const life = bonusEnabled === undefined ? "…" : fmt(Math.round(baseLife * lifeMult));
  const heroAvailable = heroLikes != null;
  const heroLabel = resting ? (ru ? `Сделать героем, отдых ${restLeft}` : `Make a hero, resting ${restLeft}`) : (ru ? `Сделать героем за ${fmt(heroLikes ?? 0)} лайков` : `Make a hero for ${fmt(heroLikes ?? 0)} likes`);
  const upgradeLabel = resting ? (ru ? `Улучшить, отдых ${restLeft}` : `Upgrade, resting ${restLeft}`) : (ru ? `Улучшить за ${upgradeCost == null ? "неизвестное количество" : fmtGold(upgradeCost, ru)} золота` : `Upgrade for ${upgradeCost == null ? "an unknown amount of" : fmtGold(upgradeCost, ru)} gold`);
  const stepGold = (std: number) => (goldMult == null ? "…" : fmtGold(goldAtMultiplier(std, goldMult), ru));

  return <>
    <div className="bcd-head">
      <div className="bcd-art">
        <ChipImage src={template.imageUrl} level={chip.level} alt={template.name} className={chipBusyImageClass(busy)} />
        {busy && <ChipBusyBadge busy={busy} />}
      </div>
      <div className="bcd-identity">
        <h2>{template.name}</h2>
        {template.collectionName && <strong>{template.collectionName}</strong>}
        <p>{ru ? "Вид" : "Type"} #{template.templateNo} · {ru ? "Фишка" : "Chip"} #{chip.serialNo ?? "?"}</p>
      </div>
      <button className="bcd-close" type="button" onClick={onClose} aria-label={ru ? "Закрыть карточку" : "Close chip details"}><X aria-hidden="true" /></button>
    </div>

    <section className="bcd-combat" aria-label={ru ? "Боевые характеристики" : "Combat stats"}>
      <h3>{ru ? "Босс и рейд" : "Boss and raid"}</h3>
      <div className="bcd-stat-grid">
        <div><span>{ru ? "Атака" : "Attack"}</span><strong>{bonusError ? "—" : attack}</strong></div>
        <div><span>{ru ? "Жизнь" : "Health"}</span><strong>{bonusError ? "—" : life}</strong></div>
      </div>
      <details className="bcd-stat-info">
        <summary aria-label={ru ? "Как получились боевые характеристики" : "How combat stats are calculated"}><Info aria-hidden="true" /></summary>
        <div className="bcd-stat-info-body">
          {bonusError ? <button type="button" onClick={onBonusRetry}>{ru ? "Не удалось загрузить бонус. Повторить" : "Bonus unavailable. Retry"}</button> : <>
            <p>{ru ? "Дуэль с игроком" : "Player duel"}: {ru ? "сила" : "power"} {fmt(lo)}–{fmt(hi)}</p>
            <p>{ru ? "Основа" : "Base"}: {ru ? "атака" : "attack"} {fmt(lo)}–{fmt(hi)}, {ru ? "жизнь" : "health"} {fmt(baseLife)}</p>
            <p>{ru ? "Тираж коллекции" : "Collection supply"}: {supply == null ? "—" : fmt(supply)}</p>
            <p>{bonusEnabled ? (ru ? `Бонус в бою: атака ×${attackMult}, жизнь ×${lifeMult}` : `Battle bonus: attack ×${attackMult}, health ×${lifeMult}`) : (ru ? "Бонус коллекции сейчас не действует" : "Collection bonus is currently inactive")}</p>
          </>}
        </div>
      </details>
    </section>

    {busy && <ChipBusyNotice busy={busy} />}
    {upgradeReason && !isMax && <p className="bcd-upgrade-reason">{ru ? "Сейчас нельзя улучшить: " : "Cannot upgrade now: "}{upgradeReason}</p>}
    {!isMax && <GoldRequiredLine className="bcd-upgrade-reason" need={goldNeed} have={goldHave} />}

    <div className={`bcd-actions${heroAvailable ? "" : " bcd-actions-single"}`}>
      {heroAvailable && <button className="bcd-hero" type="button" disabled={resting} onClick={onHero} aria-label={heroLabel}>
        <Crown aria-hidden="true" /><span><strong>{ru ? "Сделать героем" : "Make a hero"}</strong><small>{resting ? (ru ? `Отдых · ${restLeft}` : `Resting · ${restLeft}`) : <><ResourceGlyph kind="likes" /> {fmt(heroLikes)}</>}</small></span>
      </button>}
      {isMax ? <div className="bcd-max" aria-label={ru ? "Максимальный уровень" : "Maximum level"}>MAX</div> : <button className="bcd-upgrade" type="button" disabled={resting || upgradeCost == null || noGold} onClick={onCraft} aria-label={upgradeLabel}>
        <ArrowUp aria-hidden="true" /><span><strong>{ru ? "Улучшить" : "Upgrade"}</strong><small>{resting ? (ru ? `Отдых · ${restLeft}` : `Resting · ${restLeft}`) : <><ResourceGlyph kind="gold" /> {upgradeCost == null ? "—" : fmtGold(upgradeCost, ru)}</>}</small></span>
      </button>}
    </div>

    {!isMax && <details className="bcd-disclosure">
      <summary>{ru ? "Путь прокачки до 5★" : "Upgrade path to 5★"}<ChevronRight aria-hidden="true" /></summary>
      <div className="bcd-disclosure-body">
        {craftPathFrom(chip.level).map(step => <p key={step.from}><span>{labelForLevel(step.from)} → {labelForLevel(step.to)}</span><span>+{step.chips - 1}× {labelForLevel(step.sacrificeLevel ?? step.from)} {step.identical ? t("chips.same_kind") : t("chips.any_kind")} · {stepGold(step.cost)} <ResourceGlyph kind="gold" /></span></p>)}
        <p><span>{ru ? `До 5★: ~${CRAFT_TOTALS["5"].lvl1} фишек 1★` : `To 5★: ~${CRAFT_TOTALS["5"].lvl1} level-1 chips`}</span><span>~{goldMult == null ? "…" : fmtGold(craftGoldTotal(CRAFT_PATH, goldMult), ru)} <ResourceGlyph kind="gold" /></span></p>
      </div>
    </details>}
    <details className="bcd-disclosure">
      <summary>{ru ? "Другие действия" : "Other actions"}<ChevronRight aria-hidden="true" /></summary>
      <div className="bcd-disclosure-body bcd-other-actions">
        <button type="button" disabled={sellDisabled} onClick={onSell}>{ru ? "Продать в Маркете за" : "Sell on the Market for"} <ResourceGlyph kind="gold" /> {ru ? "золото" : "gold"}</button>
      </div>
    </details>
  </>;
}
