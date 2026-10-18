// Наборы городов с образца (владелец, 07.10.2026: «у всех всё есть — и
// ратуши свои; города названы не просто так — у входа табличка "Город
// такой-то"; составь списки, какие постройки для какого города; радиус у
// города небольшой — по привязанным лавкам ± несколько клеток»).
//
// Набор — облик ратуши. На образце он и есть вид города: драконья ратуша
// стоит в драконьих городах, адская — в адских, единорожья — у единорогов.
// Город образца — постройки, которым его ратуша ближайшая, не дальше самой
// дальней привязанной лавки + KIT_MARGIN (лавок нет — KIT_RADIUS).
//
// Раса набора — метка облика ратуши, а нет её — большинство меток построек
// его городов. В набор идут рабочие постройки (как у коллекций рас) в облике
// его расы или без расы: юпиковский «Университет» в драконьем городе мимо.
// Свой облик (own) — расы набора или стоящий только в его городах; общий
// («Склад», что стоит везде) — запасной, когда своего для роли нет.
//
// Домашний набор расы — где её построек больше всего. Туда же идёт расовый
// набор обликов, что в городах образца ещё не стоит («Кабан» у таверны,
// музея, склада): у каждой расы облик есть почти в каждой группе. Облик
// встаёт на шаблон своей группы, а если тот не рабочий — на тот, где группа
// стоит на образце чаще всего (облики «Лавки» — на рынке, «Арены» — на арене).
import { RACE_MIN_ROLES } from "@/lib/raid/worldgen/collections";
import type { KitLook, TownKit } from "@/lib/raid/worldgen/spec";
import type { BuildingOption } from "@/lib/raid/zonegen/settlement-types";
import { bestLabel, commonLook, labelParts, signRaces } from "./learn-kits-label";
import {
  catalogView,
  inc,
  lookId,
  pairKey,
  top,
  townsOf,
  type Look,
  type Town,
  type TownCellRow,
} from "./learn-kits-view";

export type { TownCellRow } from "./learn-kits-view";
export { KIT_MARGIN, KIT_RADIUS, SIGN_REACH } from "./learn-kits-view";

/** Земля набора — та, что под его городами не реже этой доли. */
const TERRAIN_SHARE = 0.15;
const KITS_MAX = 40;
const LOOKS_MAX = 80;

type Draft = {
  id: string;
  towns: Town[];
  race: string | null;
  votes: Map<string, number>;
  looks: Map<string, KitLook>;
};

/** Наборы городов с образца: по облику ратуши. Ратуш нет — наборов нет. */
export function learnKits(
  rows: readonly TownCellRow[],
  catalog: readonly BuildingOption[],
): TownKit[] {
  const cv = catalogView(catalog, rows);
  const halls = rows.filter((r) => r.effect === "town_hall" && cv.tpl.has(r.tpl));
  if (halls.length === 0) return [];
  const { towns, strays } = townsOf(rows, halls);

  const drafts = new Map<string, Draft>();
  for (const t of towns) {
    const id = lookId({ t: t.hall.tpl, s: t.hall.skin });
    const d: Draft = drafts.get(id) ?? {
      id,
      towns: [],
      race: null,
      votes: new Map(),
      looks: new Map(),
    };
    d.towns.push(t);
    drafts.set(id, d);
  }
  for (const d of drafts.values()) {
    const members = d.towns.flatMap((t) => t.members);
    for (const m of members)
      for (const race of cv.races({ t: m.tpl, s: m.skin })) inc(d.votes, race);
    const hall = d.towns[0].hall;
    d.race = cv.races({ t: hall.tpl, s: hall.skin })[0] ?? top(d.votes);
    for (const m of members) {
      const l = { t: m.tpl, s: m.skin };
      const rc = cv.races(l);
      if (!cv.working(m.tpl) || !cv.plain(m)) continue;
      if (rc.length > 0 && (d.race === null || !rc.includes(d.race))) continue;
      const was = d.looks.get(pairKey(l)) ?? { ...l, n: 0, own: false };
      d.looks.set(pairKey(l), { ...was, n: was.n + 1 });
    }
  }

  // Свой облик набора: его расы или стоящий только в его городах.
  const kitsOf = new Map<string, Set<string>>();
  for (const d of drafts.values())
    for (const l of d.looks.values())
      kitsOf.set(lookId(l), (kitsOf.get(lookId(l)) ?? new Set()).add(d.id));
  for (const d of drafts.values())
    for (const l of d.looks.values())
      l.own =
        (d.race !== null && cv.races(l).includes(d.race)) || kitsOf.get(lookId(l))?.size === 1;

  const home = homeKits([...drafts.values()]);
  addRaceSets(catalog, cv, home, [...drafts.values()]);

  const allSigns = towns.flatMap((t) => t.signs).concat(strays);
  const strayFor = (race: string) => strays.filter((s) => signRaces(s.text ?? "").includes(race));
  const out: TownKit[] = [];
  for (const d of [...drafts.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const looks = [...d.looks.values()].sort(
      (a, b) => b.n - a.n || (pairKey(a) < pairKey(b) ? -1 : 1),
    );
    const roles = new Set(looks.map((l) => cv.role(l.t)).filter((r) => r && r !== "town_hall"));
    const shop = looks.some(
      (l) => cv.role(l.t) === "market" && cv.tpl.get(l.t)?.effect === "market",
    );
    if (roles.size < RACE_MIN_ROLES || !shop) continue;
    const names = d.towns.map((t) => (t.hall.name ?? "").trim()).filter((n) => n.length > 0);
    const isHome = d.race !== null && home.get(d.race) === d;
    const signs = d.towns.flatMap((t) => t.signs).concat(isHome ? strayFor(d.race as string) : []);
    const label = bestLabel(
      signs.flatMap((s) => labelParts(s.text ?? "", names)),
      d.race,
    );
    // Облик — как у табличек с этой подписью (у драконов — драконья табличка).
    // Табличка чужой расы («Юпик Воин» у «Города Пчел») — мимо, тогда обычная.
    const fits = (s: TownCellRow) => {
      const rc = cv.races({ t: s.tpl, s: s.skin });
      return rc.length === 0 || (d.race !== null && rc.includes(d.race));
    };
    const same = signs.filter(
      (s) => fits(s) && label !== null && labelParts(s.text ?? "", names).includes(label),
    );
    out.push({
      id: d.id,
      race: d.race,
      label,
      hall: commonLook(d.towns.map((t) => t.hall)) as Look,
      sign: label === null ? null : (commonLook(same) ?? commonLook(allSigns.filter(fits))),
      terrains: terrainsOf(d.towns),
      looks: looks.slice(0, LOOKS_MAX),
      towns: [...new Set(names.map((n) => n.slice(0, 60)))].sort().slice(0, 16),
    });
  }
  return out.slice(0, KITS_MAX);
}

/** Домашний набор расы: где её построек больше всего; ничья — где больше городов. */
function homeKits(drafts: readonly Draft[]): Map<string, Draft> {
  const home = new Map<string, Draft>();
  for (const d of [...drafts].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (d.race === null) continue;
    const was = home.get(d.race);
    const n = d.votes.get(d.race) ?? 0;
    const wn = was ? (was.votes.get(d.race) ?? 0) : -1;
    if (!was || n > wn || (n === wn && d.towns.length > was.towns.length)) home.set(d.race, d);
  }
  return home;
}

/** Расовый набор обликов, которого нет в городах образца, — в домашний набор расы. */
function addRaceSets(
  catalog: readonly BuildingOption[],
  cv: ReturnType<typeof catalogView>,
  home: ReadonlyMap<string, Draft>,
  drafts: readonly Draft[],
): void {
  const seen = new Map<string, Set<string>>();
  for (const d of drafts) {
    if (d.race === null) continue;
    const set = seen.get(d.race) ?? new Set<string>();
    for (const l of d.looks.values()) set.add(lookId(l));
    seen.set(d.race, set);
  }
  const add = (race: string, l: Look) => {
    const d = home.get(race);
    const set = seen.get(race);
    if (!d || !set || set.has(lookId(l)) || cv.role(l.t) === "town_hall") return;
    set.add(lookId(l));
    d.looks.set(pairKey(l), { ...l, n: 0, own: true });
  };
  for (const o of catalog) {
    if (cv.working(o.id) && (cv.usage.get(o.id) ?? 0) > 0)
      for (const race of o.races ?? []) add(race, { t: o.id, s: null });
    for (const s of o.skins ?? []) {
      const t = (s.races?.length ?? 0) > 0 ? cv.host(s.id) : null;
      if (t !== null) for (const race of s.races ?? []) add(race, { t, s: s.id });
    }
  }
}

/** Земли под городами набора: ратуши и их постройки, не реже TERRAIN_SHARE. */
function terrainsOf(towns: readonly Town[]): TownKit["terrains"] {
  const count = new Map<string, number>();
  for (const t of towns)
    for (const c of [t.hall, ...t.members]) if (c.terrain) inc(count, c.terrain);
  const total = [...count.values()].reduce((s, n) => s + n, 0);
  return [...count]
    .filter(([, n]) => n >= total * TERRAIN_SHARE)
    .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1))
    .slice(0, 8)
    .map(([id, w]) => ({ id, w }));
}
