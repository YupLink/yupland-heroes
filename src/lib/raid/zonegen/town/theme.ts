// Тема обликов: чтобы город был «драконьим» или «кабаньим» целиком, а не
// лоскутным одеялом из шести рас.
//
// Облики — наборы владельца (raid_building_group + raid_building_skin): в
// каждой группе картинки подписаны расой — Юпик, Кабан, Дракон, Единорог,
// Виходка, Пчела, Северный/Морж, Адский/мертвец. Первое слово имени облика и
// есть тема. Тема выбирается один раз на поселение и красит все постройки,
// у которых облик этой темы есть; у кого нет — стоят в своём базовом виде.
import { normName } from "@/lib/raid/zonegen/town/roles";
import { raceOfTheme } from "@/lib/raid/assetTags";
import type { BuildingOption } from "@/lib/raid/zonegen/settlement-types";
import type { RoleOption } from "@/lib/raid/zonegen/town/types";

/**
 * Жребий темы — только среди тем, у которых облик есть хотя бы в пяти ролях:
 * иначе «драконий» город выйдет драконьим в одной лавке из пятнадцати.
 */
export const THEME_MIN_COVERAGE = 5;

/** Явный отказ от обликов: базовые картинки шаблонов. */
export const THEME_NONE = "none";

/**
 * Синонимы одной расы: зимние облики подписаны то «Северный», то «Морж», то
 * «Зимний»; адские — «Адский» и «Мертвец». Для города это одна тема.
 */
const SYNONYMS: ReadonlyArray<readonly [string, string]> = [
  ["северн", "Северный"],
  ["морж", "Северный"],
  ["зимн", "Северный"],
  ["адск", "Адский"],
  ["мертв", "Адский"],
];

/** Имя облика → тема: первое слово до пробела/дефиса, синонимы сведены. */
export function themeOfName(name: string): string {
  const word = normName(name).split(/[\s\-–—_.,]+/)[0] ?? "";
  if (word === "") return "";
  for (const [stem, theme] of SYNONYMS) if (word.startsWith(stem)) return theme;
  return word[0].toUpperCase() + word.slice(1);
}

/** Облик принадлежит теме: по первому слову или по вхождению основы темы. */
function skinMatches(skinName: string, theme: string): boolean {
  if (themeOfName(skinName) === theme) return true;
  const stem = normName(theme);
  return stem.length >= 3 && normName(skinName).includes(stem);
}

/**
 * Темы справочника и их охват: в скольких РОЛЯХ есть облик темы. Считаем
 * роли, а не шаблоны: двадцать рынков с «Юпиком» не делают город юпиковым,
 * если у ратуши, храма и таверны облика нет.
 */
export function themesOf(options: RoleOption[]): Array<{ theme: string; coverage: number }> {
  const roles = new Map<string, Set<string>>();
  for (const o of options) {
    for (const s of o.skins ?? []) {
      const theme = themeOfName(s.name);
      if (theme === "") continue;
      const set = roles.get(theme) ?? new Set<string>();
      set.add(o.role);
      roles.set(theme, set);
    }
  }
  return [...roles.entries()]
    .map(([theme, set]) => ({ theme, coverage: set.size }))
    .sort(
      (a, b) => b.coverage - a.coverage || (a.theme < b.theme ? -1 : a.theme > b.theme ? 1 : 0),
    );
}

/**
 * Тема поселения. Заданная админом — как есть (сведённая к имени темы);
 * пусто — жребий от сида среди хорошо покрытых. null — без обликов: тем с
 * охватом ≥ 5 нет или админ выбрал «без темы».
 */
export function pickTheme(
  options: RoleOption[],
  requested: string,
  rnd: () => number,
): string | null {
  const want = requested.trim();
  if (want === THEME_NONE) return null;
  if (want !== "") return themeOfName(want) || null;
  const pool = themesOf(options).filter((t) => t.coverage >= THEME_MIN_COVERAGE);
  if (pool.length === 0) return null;
  return pool[Math.floor(rnd() * pool.length)].theme;
}

/** FNV-1a: ничья между обликами одной темы решается хешем, а не порядком в базе. */
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Облик шаблона для темы (id без префикса skin:) или null — облика этой темы
 * у шаблона нет, он встаёт в базовом виде. Если обликов темы несколько
 * («Юпик» и «Юпик 2»), берём по хешу от соли: один сид — один выбор.
 */
export function skinFor(option: BuildingOption, theme: string | null, salt = 0): string | null {
  if (theme === null || theme === "") return null;
  // Облик темы — по имени («Таверна Юпиков») или по метке расы («Баня» с
  // меткой Юпик): облики коллекций подписаны метками, а не всегда именем.
  const race = raceOfTheme(theme);
  const hits = (option.skins ?? []).filter(
    (s) => skinMatches(s.name, theme) || (race !== null && (s.races ?? []).includes(race)),
  );
  if (hits.length === 0) return null;
  let best = hits[0];
  let bestH = hashStr(`${salt}:${best.id}`);
  for (const s of hits.slice(1)) {
    const h = hashStr(`${salt}:${s.id}`);
    if (h < bestH || (h === bestH && s.id < best.id)) {
      best = s;
      bestH = h;
    }
  }
  return best.id;
}
