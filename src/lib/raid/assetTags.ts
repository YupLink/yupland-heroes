// Метки ассетов карты: к каким типам местности и расам относится декор,
// постройка или облик постройки (владелец, 25.09). Чистые правила — их
// одинаково читают сервер (генератор, автоматическая разметка) и админка.
//
// Пустой список значит «подходит всем»: декор без галочек местности ставится
// где угодно, постройка без расы — в любой город. Ограничивает только то, что
// отмечено.
import { RACES } from "@/components/heroMeta";

export type AssetTagKind = "decoration" | "building" | "skin";

export type AssetTags = {
  /** id шаблонов местности (kind = 'terrain'). */
  terrains: string[];
  /** Расы из heroMeta.RACES. */
  races: string[];
  /** true — разметила автоматика, админ ещё не трогал. */
  auto: boolean;
};

export const NO_TAGS: AssetTags = { terrains: [], races: [], auto: true };

/**
 * Основы имён рас. Порядок важен: «Драконо кошки» и «Виходка» — это ДраКошка,
 * а не Дракон, поэтому ДраКошка проверяется первой и «съедает» своё слово.
 */
const RACE_STEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/дракош|вихо[дт]к|драконо\s*кош/, "ДраКошка"],
  [/дракон/, "Дракон"],
  [/единорог/, "Единорог"],
  [/кабан/, "Кабан"],
  [/пчел/, "Пчела"],
  [/юпик/, "Юпик"],
];

/** Расы, названные в имени («Магазин единорога», «Кабаньи ворота», «Юпик Лавка»). */
export function racesFromName(name: string | null | undefined): string[] {
  let s = (name ?? "").toLowerCase().replace(/ё/g, "е");
  const out: string[] = [];
  for (const [re, race] of RACE_STEMS) {
    if (!re.test(s)) continue;
    out.push(race);
    s = s.replace(new RegExp(re.source, "g"), " ");
  }
  return out.filter((r) => (RACES as readonly string[]).includes(r));
}

/** Раса темы города («Виходка» → ДраКошка). Тема без расы (Северный, Адский) — null. */
export function raceOfTheme(theme: string | null | undefined): string | null {
  return racesFromName(theme)[0] ?? null;
}

/** Расовая постройка встаёт только в город своей расы; нерасовая — в любой. */
export function raceAllowed(races: readonly string[] | undefined, townRace: string | null): boolean {
  if (!races || races.length === 0) return true;
  return townRace !== null && races.includes(townRace);
}

/** Местность подходит: галочек нет, клетка неизвестна или она среди отмеченных. */
export function terrainAllowed(
  terrains: readonly string[] | undefined,
  terrainId: string | null | undefined,
): boolean {
  if (!terrains || terrains.length === 0 || !terrainId) return true;
  return terrains.includes(terrainId);
}

type Tagged = { races?: string[]; skins?: Array<{ races?: string[] }> };

/**
 * Справочник построек для города расы townRace: чужие расовые постройки
 * убираем целиком, чужие расовые облики — снимаем (постройка встанет в своём
 * облике или в базовом виде).
 */
export function scopeByRace<T extends Tagged>(options: readonly T[], townRace: string | null): T[] {
  const out: T[] = [];
  for (const o of options) {
    if (!raceAllowed(o.races, townRace)) continue;
    const skins = o.skins?.filter((s) => raceAllowed(s.races, townRace));
    out.push(skins === undefined ? o : { ...o, skins });
  }
  return out;
}

/** Нормализовать список из формы/базы: строки без дублей и пустых. */
export function cleanList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<string>();
  for (const x of v) {
    const s = typeof x === "string" ? x.trim() : "";
    if (s) out.add(s);
  }
  return [...out];
}
