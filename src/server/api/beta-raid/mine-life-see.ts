// Запас службы ЧУЖОЙ шахты — только во «втором обзоре» героя (владелец,
// 04.11.2026): «сейчас особо умные смотрят на всю карту, ищут шахты, у которых
// скоро ремонт, и захватывают их в последний момент». Круг тот же, что у
// мешочков (FOG_ACTIVE_RADIUS = 20), на разведанных игроком клетках; свои шахты
// видно с любого расстояния. Фильтр на сервере, от позиции героя в базе: клиент
// чужого запаса вдали не получает вовсе (ни полосы на карте, ни цифр в окне шахты).
//
// Админ (05.11.2026, владелец): «видит так же, как игроки, если не включён режим
// бога». Полосы карты — все только в режиме бога (mine-life-bars). Окно шахты в
// режиме бога не открывается (тап ведёт в окно клетки, useAdminLive.handleTap),
// поэтому окно у админа — всегда как у игрока.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { FOG_ACTIVE_RADIUS } from "@/lib/raid/fogRadius";
import { sightRadiusSql } from "@/server/api/beta-raid/sight/sight-sql";
import type { MineV2Stamped } from "@/lib/mineV2Clock";
import { raidOwner } from "./owner";

/** Радиус, в котором виден запас чужой шахты, — круг «второго обзора» (под биноклем 40). */
export const MINE_HP_SEE = FOG_ACTIVE_RADIUS;

/**
 * Клетка `c` (столбцы q, r) в круге «второго обзора» (sightRadiusSql) от героя аккаунта на этой
 * карте и разведана им. Строки позиции нет — не видно ничего.
 */
export function inSightSql(c: string, account: string, mapId: string): string {
  const acc = sqlStr(account);
  const map = sqlStr(mapId);
  return `(EXISTS (SELECT 1 FROM yuplink.beta_raid_positions p
                    WHERE p.account_id = ${acc} AND (p.map_id IS NULL OR p.map_id = ${map})
                      AND (abs(${c}.q - p.q) + abs(${c}.r - p.r)
                           + abs(${c}.q + ${c}.r - p.q - p.r)) / 2 <= ${sightRadiusSql(acc)})
           AND EXISTS (SELECT 1 FROM yuplink.beta_raid_fog_seen f
                        WHERE f.owner = ${acc} AND f.map_id = ${map}
                          AND f.cell = ${c}.q || ',' || ${c}.r))`;
}

/** Окно шахты: виден ли запас этой клетки — одинаково для игрока и админа. */
export async function mineHpInSight(
  wallet: string,
  mapId: string,
  q: number,
  r: number,
): Promise<boolean> {
  if (!Number.isInteger(q) || !Number.isInteger(r)) return false;
  const account = await raidOwner(wallet);
  const rows = (await mcpExec(
    `SELECT 1 AS ok FROM (SELECT ${q}::int AS q, ${r}::int AS r) c
      WHERE ${inSightSql("c", account, mapId)};`,
    { wrapJson: true },
  )) as unknown[] | null;
  return Array.isArray(rows) && rows.length > 0;
}

/** Срок «не сломается» для спрятанного запаса: часы окна не ждут поломки. */
const FAR_MS = 10 * 365 * 24 * 3_600_000;

/**
 * Запас чужой шахты вдали — спрятан: доля и сроки нейтральные, far — окно
 * полосы не рисует. Режим, добыча и уровень остаются.
 */
export function hideMineLife(v2: MineV2Stamped): MineV2Stamped {
  const now = Number(v2.serverNow) > 0 ? Number(v2.serverNow) : Date.now();
  return {
    ...v2,
    far: true,
    lifeLeft: 1,
    lifeAt: new Date(now).toISOString(),
    breakAt: now + FAR_MS,
  };
}
