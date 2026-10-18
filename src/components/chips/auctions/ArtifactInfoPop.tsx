// Карточка «что даёт артефакт» по нажатию на лот (владелец, 14.10.2026). Сама не
// прячется (3 секунды не хватало прочитать): закрывает повторное нажатие на тот
// же лот (вкл/выкл) или нажатие в любом другом месте. Прибавка к характеристике и что эта
// характеристика делает (текст — из справочника параметров, сверен с кодом),
// условные прибавки за расу/класс/землю героя, иммунитеты, слот.
import { useEffect, useRef } from "react";
import { statMeta } from "@/components/itemStat";
import { metaLabel } from "@/components/heroMeta";
import { STATS_SECTION } from "@/components/params-guide/data/guideStats";
import { rarityLabel, type PrizeInfo } from "./auctionFormat";
import { fishBonusText } from "@/lib/raid/fishBonus";
import "./auction-artpop.css";

/** Характеристика артефакта (Attack, Speed…) → запись справочника. */
const GUIDE_ID: Record<string, string> = {
  attack: "atk",
  damage: "atk",
  strength: "atk",
  health: "hp",
  hp: "hp",
  armor: "arm",
  luck: "luck",
  speed: "spd",
  intellect: "int",
  trade: "trade",
  alchemy: "alchemy",
};

function statWhat(statType: string | null, en: boolean): string | null {
  const id = GUIDE_ID[(statType ?? "").trim().toLowerCase()];
  const entry = STATS_SECTION.entries.find((e) => e.id === id);
  return entry ? entry.what[en ? 1 : 0] : null;
}

/** Атрибут на том, что открывает карточку: нажатие по нему — переключатель, а не «мимо». */
export const ARTPOP_TRIGGER = "data-artpop";

/**
 * Закрыть ли карточку по нажатию: внутри неё — нет; по своему лоту — нет (его
 * клик сам переключит вкл/выкл); куда угодно ещё, в том числе по чужому лоту, — да.
 */
export function closesOnTap(
  insideCard: boolean,
  tappedAnchor: string | null,
  anchor: string,
): boolean {
  return !insideCard && tappedAnchor !== anchor;
}

export function ArtifactInfoPop({
  info,
  en,
  anchor,
  onClose,
}: {
  info: PrizeInfo;
  en: boolean;
  /** Значение ARTPOP_TRIGGER у открывшего лота (обычно id лота). */
  anchor: string;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const target = e.target as Element | null;
      const tapped = target?.closest?.(`[${ARTPOP_TRIGGER}]`)?.getAttribute(ARTPOP_TRIGGER) ?? null;
      if (closesOnTap(!!box.current?.contains(target), tapped, anchor)) onClose();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", esc);
    };
  }, [anchor, onClose]);

  const lang = en ? "en" : "ru";
  const { Icon, color } = statMeta(info.statType);
  const stat = metaLabel(info.statType, lang);
  const what = statWhat(info.statType, en);
  const extra: Array<[string, string | null | undefined, number | null | undefined]> = [
    [en ? "Class" : "Класс", info.spec, info.specAmount],
    [en ? "Race" : "Раса", info.race, info.raceAmount],
    [en ? "Land" : "Земля", info.land, info.landAmount],
  ];
  const rarity = rarityLabel(info.rarity, en);
  const fish = fishBonusText(Number(info.fishBonusPct) || 0, lang);

  return (
    <div ref={box} className="auction-artpop" role="tooltip">
      {info.statType && (
        <div className="auction-artpop__main">
          <Icon style={{ color }} aria-hidden="true" />
          <b>
            +{info.statAmount ?? 0} {stat}
          </b>
          {rarity && (
            <span className={`auction-rarity auction-rarity--${info.rarity}`}>{rarity}</span>
          )}
        </div>
      )}
      {what && <p className="auction-artpop__what">{what}</p>}
      {extra.map(([title, value, amount]) =>
        value ? (
          <p key={title} className="auction-artpop__row">
            {title} {metaLabel(value, lang)}: <b>+{amount ?? 0}</b> {stat}
          </p>
        ) : null,
      )}
      {!!info.immunities?.length && (
        <p className="auction-artpop__row">
          {en ? "Immunity" : "Иммунитет"}:{" "}
          <b>{info.immunities.map((i) => metaLabel(i, lang)).join(", ")}</b>
        </p>
      )}
      {fish && (
        <p className="auction-artpop__row">
          {en ? "Fishing" : "Рыбалка"}: <b>{fish}</b> {en ? "catch chance" : "к шансу улова"}
        </p>
      )}
      {info.slot && (
        <p className="auction-artpop__row">
          {en ? "Slot" : "Слот"}: <b>{metaLabel(info.slot, lang)}</b>
        </p>
      )}
    </div>
  );
}
