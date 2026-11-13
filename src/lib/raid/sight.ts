// Бинокль (владелец, 08.11.2026): «радиус второго обзора 20 → 40 клеток на 3
// минуты; применения суммируются — хоть 20 за раз, это час». Одно правило на
// сервер и клиент: сервер решает, что игроку видно (хп и запас чужих шахт,
// мешочки, бугорки, ямки, газеты), клиент — плёнку тумана и свои фильтры.
//
// Эффект живёт строкой beta_raid_player_effects вида `sight` (одна на аккаунт,
// срок продлевается — TIMED_EFFECT_UPSERT), в состоянии рейда едет в списке
// бустов (effects.buff) — оттуда его читает и значок над героем.
import { BUILDER_WORLD_MAP_ID } from "./builderWorld";
import { FOG_ACTIVE_RADIUS, FOG_REACH_RADIUS } from "./fogRadius";

/** Вид строки эффекта бинокля. */
export const SIGHT_KIND = "sight";
/** Обзор с биноклем, клеток. */
export const BINOCULAR_RADIUS = 40;
/** Досягаемость в неразведанном с биноклем (без него — FOG_REACH_RADIUS, 10). */
export const BINOCULAR_REACH_RADIUS = 20;

/**
 * Досягаемость в неразведанном на карте: 10 клеток, под биноклем 20; null — её
 * нет. В Свартальвхейме нет (владелец, 12.11.2026): в туман там не нажать.
 */
export function fogReachRadius(mapId: string | null | undefined, sightRadius: number): number | null {
  if (mapId === BUILDER_WORLD_MAP_ID) return null;
  return sightRadius > FOG_ACTIVE_RADIUS ? BINOCULAR_REACH_RADIUS : FOG_REACH_RADIUS;
}
/** Минут обзора за один бинокль. */
export const BINOCULAR_MINUTES = 3;
/** Лестница (§8.121, владелец 08.11): каждое использование — ещё 10 золота сверх лестницы и энергии шага. */
export const LADDER_GOLD = 10;
/** Самый широкий обзор — для фильтров, которые не знают, чей он (сигналы потока). */
export const SIGHT_MAX = Math.max(FOG_ACTIVE_RADIUS, BINOCULAR_RADIUS);

type BuffLike = { kind?: unknown; expiresAt?: unknown };

/** До какого часа действует бинокль (мс); 0 — не действует. */
export function sightUntil(buff: unknown, now = Date.now()): number {
  if (!Array.isArray(buff)) return 0;
  let until = 0;
  for (const b of buff as BuffLike[]) {
    if (b?.kind !== SIGHT_KIND || typeof b.expiresAt !== "string") continue;
    const at = Date.parse(b.expiresAt);
    if (Number.isFinite(at) && at > now && at > until) until = at;
  }
  return until;
}

/** Радиус «второго обзора» по списку бустов состояния. */
export const sightRadiusOf = (buff: unknown, now = Date.now()): number =>
  sightUntil(buff, now) > now ? BINOCULAR_RADIUS : FOG_ACTIVE_RADIUS;
