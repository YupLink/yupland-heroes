// HP объекта на клетке карты: общее на всех игроков, как у босса.
//
// У босса текущее HP живёт в chip_boss.current_hp, у объектов карты своего
// места не было — поэтому сундук выдавал награду мгновенно и БЕСКОНЕЧНО.
// Здесь тот же приём, что в commitRaidRun: декремент одним SQL с FOR UPDATE,
// чтобы параллельные удары не перетирали друг друга.
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { BARE_OBJECT_ID } from "./admin-defeat-sql";
import { RUNNER_LAYER, type ObjectLayer } from "./runners";
import type { EncounterTarget } from "./encounter-target";

export type ObjectHpRow = {
  id: string;
  map_id: string;
  q: number;
  r: number;
  object_id: string;
  cycle_no: number;
  max_hp: number;
  current_hp: number;
  killed_at: string | null;
  /** Растёт при каждом восстановлении объекта админом. */
  generation: number;
  /** Когда началась текущая жизнь объекта — по ней отсекается старый урон. */
  life_started_at?: string | null;
};

/**
 * Строка HP для СЛОЯ клетки (map, q, r, layer). Если её ещё нет — создаёт с
 * полным HP цели. Гонка закрыта ON CONFLICT по уникальному индексу клетки.
 *
 * Номер слоя лежит в колонке cycle_no: у объектов карты она всегда была нулём,
 * и её же спрашивает весь прежний код (см. runners.ts). Беглец берёт единицу и
 * потому мирно делит клетку с чужим объектом.
 */
export async function ensureObjectHp(opts: {
  mapId: string;
  q: number;
  r: number;
  layer: ObjectLayer;
  target: EncounterTarget;
}): Promise<ObjectHpRow> {
  const { mapId, q, r, layer, target } = opts;
  // Строка HP заводится ТОЛЬКО под объект, который реально стоит на клетке:
  // источник id — сама клетка (или слой беглецов), а не то, что назвал
  // вызывающий. Раньше сюда приезжал присланный шаблон, и на пустой траве
  // создавалась строка любого сундука; заодно чужой строкой запирали настоящие
  // объекты (на карте так осталось шестнадцать расхождений).
  // FOR KEY SHARE клетки: перенос объекта (god-move) держит её FOR UPDATE —
  // первый удар дождётся его и перечитает клетку. Иначе удар по старому снимку
  // завёл бы на прежней клетке живую строку HP без объекта (уехал), и награда
  // за неё выдалась бы второй раз. Лок — в подзапросе WITH (как у побега,
  // flee-sql-moves): строка клетки запирается, пока её читают.
  const source =
    layer === RUNNER_LAYER
      ? `SELECT c.object_id FROM yuplink.beta_raid_runner c
      WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${q} AND c.r = ${r}`
      : `SELECT c.object_id FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${q} AND c.r = ${r}
        AND c.object_id IS NOT NULL
        FOR KEY SHARE OF c`;
  await mcpExec(
    `WITH c AS (${source})
     INSERT INTO yuplink.beta_raid_object_hp
       (id, map_id, q, r, object_id, cycle_no, max_hp, current_hp, created_at, updated_at,
        life_started_at)
     SELECT ${sqlStr(`brh_${nanoid(10)}`)}, ${sqlStr(mapId)}, ${q}, ${r},
            ${BARE_OBJECT_ID}, ${layer}, ${target.maxHp}, ${target.maxHp},
            now(), now(), now()
       FROM c
     ON CONFLICT (map_id, q, r, cycle_no) DO NOTHING;`,
  );
  const rows = (await mcpExec(
    `SELECT id, map_id, q, r, object_id, cycle_no, max_hp, current_hp, killed_at, generation,
            life_started_at
       FROM yuplink.beta_raid_object_hp
      WHERE map_id = ${sqlStr(mapId)} AND q = ${q} AND r = ${r} AND cycle_no = ${layer}
      LIMIT 1;`,
    { wrapJson: true },
  )) as ObjectHpRow[];
  const row = rows?.[0];
  if (!row) throw new Error("Не удалось открыть объект — попробуй ещё раз");
  return row;
}

/**
 * Атомарно снимает урон. Возвращает СКОЛЬКО реально снято (клэмп по остатку),
 * новое HP и признак добивания — как commitRaidRun у босса.
 */
export async function applyObjectDamage(opts: {
  hpId: string;
  damage: number;
  wallet: string;
}): Promise<{ dealt: number; hpAfter: number; killed: boolean }> {
  const dmg = Math.max(0, Math.floor(opts.damage));
  const rows = (await mcpExec(
    `UPDATE yuplink.beta_raid_object_hp h
        SET current_hp = GREATEST(0, h.current_hp - ${dmg}),
            killed_at = CASE WHEN h.current_hp - ${dmg} <= 0 AND h.killed_at IS NULL
                             THEN now() ELSE h.killed_at END,
            killed_by = CASE WHEN h.current_hp - ${dmg} <= 0 AND h.killed_by IS NULL
                             THEN ${sqlStr(opts.wallet)} ELSE h.killed_by END,
            updated_at = now()
       FROM (SELECT current_hp AS was FROM yuplink.beta_raid_object_hp
              WHERE id = ${sqlStr(opts.hpId)} FOR UPDATE) o
      WHERE h.id = ${sqlStr(opts.hpId)}
      RETURNING h.current_hp AS hp, o.was AS was;`,
    { wrapJsonCte: true },
  )) as Array<{ hp: number; was: number }>;

  const row = rows?.[0];
  if (!row) return { dealt: 0, hpAfter: 0, killed: false };
  const hpAfter = Number(row.hp);
  const dealt = Math.max(0, Number(row.was) - hpAfter);
  // Добил тот, кто снял последний HP. Раньше «убит» возвращалось всем, кто
  // застал ноль: двадцать одновременных ударов давали девятнадцать лишних
  // выдач, каждая — полная награда сундука.
  return { dealt, hpAfter, killed: hpAfter <= 0 && dealt > 0 };
}

/** Лог удара — по нему строится турнир бета-рейда (аналог chip_boss_run). */
export async function logObjectRun(opts: {
  hpId: string;
  objectId: string;
  wallet: string;
  accountId: string;
  damage: number;
  rounds: number;
  killed: boolean;
  /** Поколение объекта: по нему делится награда за текущую жизнь. */
  generation?: number;
}): Promise<void> {
  await mcpExec(
    `INSERT INTO yuplink.beta_raid_object_run
       (id, hp_id, object_id, wallet, account_id, damage, rounds, killed, generation, created_at)
     VALUES (${sqlStr(`brr_${nanoid(10)}`)}, ${sqlStr(opts.hpId)}, ${sqlStr(opts.objectId)},
             ${sqlStr(opts.wallet)}, ${sqlStr(opts.accountId)},
             ${Math.max(0, Math.floor(opts.damage))}, ${Math.max(0, Math.floor(opts.rounds))},
             ${opts.killed}, ${Math.max(0, Math.floor(opts.generation ?? 0))}, now());`,
  );
}

/** Текущее состояние СЛОЯ клетки без создания строки (карточка объекта в UI). */
export async function peekObjectHp(opts: {
  mapId: string;
  q: number;
  r: number;
  layer: ObjectLayer;
}): Promise<{
  id: string;
  currentHp: number;
  maxHp: number;
  killed: boolean;
  generation: number;
} | null> {
  const rows = (await mcpExec(
    `SELECT id, current_hp, max_hp, killed_at, generation FROM yuplink.beta_raid_object_hp
      WHERE map_id = ${sqlStr(opts.mapId)} AND q = ${opts.q} AND r = ${opts.r}
        AND cycle_no = ${opts.layer} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{
    id: string;
    current_hp: number;
    max_hp: number;
    killed_at: string | null;
    generation: number | null;
  }>;
  const row = rows?.[0];
  if (!row) return null;
  return {
    id: row.id,
    currentHp: Number(row.current_hp),
    maxHp: Number(row.max_hp),
    killed: !!row.killed_at || Number(row.current_hp) <= 0,
    generation: Number(row.generation ?? 0) || 0,
  };
}
