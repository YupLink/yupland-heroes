// Справочник параметров: разделы по порядку и поиск по ним.
import { HERO_SECTION } from "./data/guideHero";
import { RACE_SECTION } from "./data/guideRace";
import { EFFECTS_SECTION, STATS_SECTION } from "./data/guideStats";
import { BOSS_SECTION } from "./data/guideBoss";
import { MAP_SECTION } from "./data/guideMap";
import { BUILDINGS_SECTION } from "./data/guideBuildings";
import { CASTLE_SECTION, TOWN_SECTION } from "./data/guideTown";
import { pick, type GuideEntry, type GuideLang, type GuideSection } from "./guideTypes";

export const GUIDE_SECTIONS: readonly GuideSection[] = [
  HERO_SECTION,
  RACE_SECTION,
  STATS_SECTION,
  EFFECTS_SECTION,
  BOSS_SECTION,
  MAP_SECTION,
  BUILDINGS_SECTION,
  TOWN_SECTION,
  CASTLE_SECTION,
];

/** Весь текст записи на языке — по нему ищем. */
function entryText(e: GuideEntry, lang: GuideLang): string {
  const parts = [pick(e.name, lang), pick(e.what, lang), e.where ? pick(e.where, lang) : ""];
  return parts.join(" ").toLowerCase();
}

/**
 * Разделы, отфильтрованные по выбранным чипам и строке поиска. Пустые разделы
 * выпадают. Ищем по названию, описанию и «где» — на текущем языке.
 */
export function filterGuide(
  sections: readonly GuideSection[],
  picked: readonly string[],
  search: string,
  lang: GuideLang,
): GuideSection[] {
  const needle = search.trim().toLowerCase();
  return sections
    .filter((s) => picked.length === 0 || picked.includes(s.id))
    .map((s) => ({
      ...s,
      entries: needle ? s.entries.filter((e) => entryText(e, lang).includes(needle)) : s.entries,
    }))
    .filter((s) => s.entries.length > 0);
}
