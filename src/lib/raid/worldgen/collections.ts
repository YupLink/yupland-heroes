// Города мира — по расам (владелец, 07.10.2026: «если деревня единорогов — то
// только постройки из их коллекции; а выходит, что всё спутано»).
//
// Коллекция расы — облики, подписанные её расой (метки raid_asset_tags), по
// ролям города: «Дом», «Таверна», «Храм», «Лавка»… Облик одевает любую
// РАБОЧУЮ постройку своей роли: лавка «Варка мёда» встаёт рынком, привязанным
// к ратуше. Постройка самой расы («Драконий магазин») стоит в своей картинке.
// Город расы собирается только из того, что есть в её коллекции, и каждая его
// постройка — в облике этой расы. Ратуша — в каждом городе: своя у расы, а
// если своей нет — обычная.
//
// Рабочая постройка — с настоящей функцией (meta.effect), которая работает без
// ручной настройки, и та, что реально стоит на образце (живой карте) не реже
// USED_MIN раз; в своей роли — не в RARE_SHARE раз реже основной (второй
// шаблон «Ратуши», поставленный пару раз, — дубль). Казарма и оружейная —
// рынки, чью витрину ведёт админ: без товара они пустые, в город мира не идут.
//
// У роли с несколькими шаблонами (рынков десяток) облики делятся по одному на
// шаблон: у кабанов один облик лавки — и лавка в городе одна, а не восемь
// одинаковых. Город расы — только если у неё есть лавка: ратуша продаёт свои
// товары только через лавки.
//
// Земля: у построек рас в метках стоят земли («Драконий магазин» — болота,
// «Магазин единорога» — Земля Единорогов). Город встаёт той расы, чьи лавка и
// ратуша могут стоять на земле под ним; своя земля расы — первой.
import { terrainAllowed } from "@/lib/raid/assetTags";
import { hasRealEffect } from "@/lib/raid/zonegen/town/roles";
import { hashCell } from "@/lib/raid/zonegen/town/hex";
import type { RoleOption, TownRole } from "@/lib/raid/zonegen/town/types";

/** Сколько раз шаблон должен стоять на образце, чтобы считаться «в игре». */
export const USED_MIN = 2;

/** Шаблон роли во столько раз реже основного — дубль, в мир не идёт. */
const RARE_SHARE = 0.1;

/** У города расы должно быть хотя бы столько ролей кроме ратуши. */
export const RACE_MIN_ROLES = 3;

/** Рынки с витриной админа: пустые в новом мире — мёртвые постройки. */
export const SHOWCASE: ReadonlySet<TownRole> = new Set<TownRole>(["barracks", "armory"]);

export type RaceTown = {
  /** Раса города; null — набор без расы (Ад, Мёртвые, Подземелье). */
  race: string | null;
  options: RoleOption[];
  /** Земли расы по меткам её построек: здесь её городам место первым. */
  terrains: string[];
  /** Подпись таблички у въезда («Город Драконов»); нет — без таблички. */
  label?: string | null;
  /** Облик таблички (шаблон и облик). */
  sign?: { t: string; s: string | null } | null;
};

type Skin = NonNullable<RoleOption["skins"]>[number];

const byName = (a: RoleOption, b: RoleOption): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

function addTo<T>(m: Map<string, Set<T>>, key: string, v: T): void {
  const set = m.get(key) ?? new Set<T>();
  set.add(v);
  m.set(key, set);
}

/**
 * Коллекции рас из справочника построек. usage — сколько раз шаблон стоит на
 * образце. Порядок — по частоте на образце, затем по имени: от порядка строк
 * базы ничего не зависит.
 */
export function raceTowns(
  all: readonly RoleOption[],
  usage: ReadonlyMap<string, number>,
): RaceTown[] {
  // Облики по роли и расе — со всех шаблонов роли, включая без функции
  // («Лавка», «Ратуша»-декорация): у них лежат картинки коллекций.
  const pool = new Map<string, Set<Skin>>();
  const lands = new Map<string, Set<string>>();
  const races = new Set<string>();
  for (const o of all) {
    for (const r of o.races ?? []) {
      races.add(r);
      for (const t of o.terrains ?? []) addTo(lands, r, t);
    }
    for (const s of o.skins ?? []) {
      for (const r of s.races ?? []) {
        races.add(r);
        addTo(pool, `${o.role}|${r}`, s);
      }
    }
  }
  const skinsOf = (role: TownRole, race: string): Skin[] =>
    [...(pool.get(`${role}|${race}`) ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1));
  const used = (o: RoleOption) => usage.get(o.id) ?? 0;
  const own = (o: RoleOption) => (o.races?.length ?? 0) > 0;
  const working = all.filter(
    (o) => hasRealEffect(o) && !SHOWCASE.has(o.role) && used(o) >= USED_MIN,
  );
  const top = new Map<TownRole, number>();
  for (const o of working) if (!own(o)) top.set(o.role, Math.max(top.get(o.role) ?? 0, used(o)));
  const common = working
    .filter((o) => own(o) || used(o) >= (top.get(o.role) ?? 0) * RARE_SHARE)
    .sort((a, b) => used(b) - used(a) || byName(a, b));

  const out: RaceTown[] = [];
  for (const race of [...races].sort()) {
    const options: RoleOption[] = [];
    const byRole = new Map<TownRole, RoleOption[]>();
    for (const o of common) {
      // Постройка самой расы («Драконий магазин»): своя картинка уже расовая.
      if (own(o)) {
        if (o.races?.includes(race)) options.push({ ...o, skins: [] });
        continue;
      }
      byRole.set(o.role, [...(byRole.get(o.role) ?? []), o]);
    }
    for (const [role, list] of byRole) {
      const skins = skinsOf(role, race);
      if (skins.length === 0) {
        if (role === "town_hall") options.push({ ...list[0], skins: [] });
        continue;
      }
      // Один шаблон — все облики (дома разные по клеткам); несколько — по облику
      // на шаблон, самым ходовым первыми.
      if (list.length === 1) options.push({ ...list[0], skins });
      else skins.slice(0, list.length).forEach((s, i) => options.push({ ...list[i], skins: [s] }));
    }
    const roles = new Set(options.filter((o) => o.role !== "town_hall").map((o) => o.role));
    const viable =
      roles.size >= RACE_MIN_ROLES &&
      roles.has("market") &&
      options.some((o) => o.role === "town_hall");
    if (viable) {
      const terrains = [...(lands.get(race) ?? [])].sort();
      out.push({ race, options: options.sort(byName), terrains });
    }
  }
  return out;
}

/** Постройки коллекции, которым можно стоять на этой земле (метки местности). */
export const onTerrain = (t: RaceTown, terrain: string | null): RoleOption[] =>
  t.options.filter((o) => terrainAllowed(o.terrains, terrain));

/**
 * Раса города на земле terrain от его сида: из тех, чьи лавка и ратуша там
 * встанут, — своя земля расы первой. Никто не встанет — null (город по
 * старому справочнику).
 */
export function raceTownFor(
  towns: readonly RaceTown[],
  seed: number,
  terrain: string | null = null,
): RaceTown | null {
  const fits = towns.filter((t) => {
    const here = onTerrain(t, terrain);
    return here.some((o) => o.role === "market") && here.some((o) => o.role === "town_hall");
  });
  const home = terrain === null ? [] : fits.filter((t) => t.terrains.includes(terrain));
  const pool = home.length > 0 ? home : fits;
  if (pool.length === 0) return null;
  return pool[hashCell(seed, 23, 71) % pool.length];
}

/**
 * Облик постройки на её клетке — из обликов расы этой постройки. Жребий по
 * клетке, а не по городу: улица не из одинаковых домов. Обликов нет — null
 * (постройка в своей картинке: ратуша без расовой или «Драконий магазин»).
 */
export function skinAt(
  option: RoleOption | undefined,
  seed: number,
  q: number,
  r: number,
): string | null {
  const skins = option?.skins ?? [];
  if (skins.length === 0) return null;
  return skins[hashCell(seed ^ 0x5bd1e995, q, r) % skins.length].id;
}
