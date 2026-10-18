// Переопределения объекта НА КОНКРЕТНОЙ КЛЕТКЕ.
//
// Каждый босс/сундук на карте — самостоятельный экземпляр: свой запас HP,
// свой топ по урону, своя раздача. Общим оставался только конфиг из шаблона,
// поэтому «этому Вендиго 500к, а тому 100к» задать было нельзя.
//
// Теперь клетка может переопределить часть параметров шаблона — то, что
// админ вписал в `raid_map_cells.object_config`. Пустой конфиг = как раньше,
// всё берётся из шаблона.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { EncounterTarget } from "./encounter-target";
import { parseBossSnapshot, type BossSnapshot } from "./boss-snapshot";
import { CELL_LAYER, RUNNER_LAYER, deadHpSql, type ObjectLayer } from "./runners";
import { WATER_SQL } from "./cell-sql";

/** Что можно переопределить на клетке. Всё необязательно. */
export type CellOverride = {
  maxHp?: number;
  interactionCost?: number;
  badgeLabel?: string;
  /** Конфиг наград целиком — тот же формат, что у шаблона. */
  rewardConfig?: unknown;
};

/** Объект клетки вместе со слоем, на котором он лежит. */
export type CellObject = {
  objectId: string | null;
  /** 0 — объект самой клетки, 1 — беглец под ним (runners.ts). */
  layer: ObjectLayer;
  override: CellOverride | null;
  /** Копия удалённого шаблона — по ней босс живёт дальше (boss-snapshot). */
  snapshot: BossSnapshot | null;
  /** Клетка на воде: до такой цели добираются только вплавь, на судне. */
  water: boolean;
  /**
   * Фон окна боя, заданный у ТИПА МЕСТНОСТИ клетки (`meta.battleBgUrl` шаблона
   * местности, редактируется в TerrainEditor). Подкладка под собственный фон
   * объекта: массовая раскладка сыплет одного босса по десятку местностей, и
   * задать каждому свой фон вручную физически некому.
   */
  terrainBg: string | null;
};

/**
 * Что на клетке НА САМОМ ДЕЛЕ: её ВЕРХНИЙ объект и его переопределения.
 *
 * Цель боя приходила с клиента и с клеткой не сверялась вовсе — значит на
 * любой пустой траве можно было объявить любой сундук из справочника и забрать
 * его награду. Теперь у вызывающего есть чем сверить.
 *
 * Слоёв на клетке два: её собственный объект и спрятавшийся под ним беглец.
 * Отдаём ровно тот, с которым игрок сейчас и имеет дело, — и это тот же выбор,
 * который карта ему рисует (map.ts): пока верхний жив, доступен он; забрали или
 * добили верхний — открывается беглец. Так «сначала убей босса, потом гриб»
 * держится само собой: сверху всегда одно, и подменить его нечем.
 */
export async function loadCellObject(mapId: string, q: number, r: number): Promise<CellObject> {
  const rows = (await mcpExec(
    `SELECT c.object_id, c.object_config, ${deadHpSql("c", CELL_LAYER)} AS cell_dead,
            rn.object_id AS run_object, rn.object_config AS run_config,
            EXISTS (SELECT 1 FROM yuplink.mystic_item_template t
                     WHERE t.id = c.terrain_id AND ${WATER_SQL}) AS water,
            /* Фон боя от местности. Скалярным подзапросом, а не JOIN-ом: лишняя
               строка в выборке тут дороже ошибки, чем поиск по первичному ключу.
               Комментарий блочный: запрос уезжает в обёртку row_to_json, и
               строчный, из двух дефисов, съел бы её хвост, схлопнись
               переносы строк. */
            (SELECT NULLIF(btrim(tr.meta->>'battleBgUrl'), '')
               FROM yuplink.mystic_item_template tr
              WHERE tr.id = c.terrain_id) AS terrain_bg
       FROM yuplink.raid_map_cells c
       LEFT JOIN yuplink.beta_raid_runner rn
              ON rn.map_id = c.map_id AND rn.q = c.q AND rn.r = c.r
      WHERE c.map_id=${sqlStr(mapId)} AND c.q=${Math.floor(q)} AND c.r=${Math.floor(r)}
      LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{
    object_id: string | null;
    object_config: unknown;
    cell_dead: boolean | null;
    run_object: string | null;
    run_config: unknown;
    water: boolean | null;
    terrain_bg: string | null;
  }>;
  const row = rows?.[0];
  const topAlive = !!row?.object_id && !row?.cell_dead;
  const runner = !topAlive && !!row?.run_object;
  const cfg = runner ? row?.run_config : row?.object_config;
  return {
    objectId: (runner ? row?.run_object : row?.object_id) ?? null,
    layer: runner ? RUNNER_LAYER : CELL_LAYER,
    override: parseOverride(cfg),
    snapshot: parseBossSnapshot(cfg),
    water: !!row?.water,
    terrainBg: row?.terrain_bg ?? null,
  };
}

/**
 * Объект клетки обязан совпасть с присланным. Иначе это не «бой по объекту»,
 * а «объявил объект и забрал награду».
 */
export function requireCellObject(cellObjectId: string | null, sent: string): void {
  if (!cellObjectId || cellObjectId !== sent) {
    throw new Error("Объект не найден");
  }
}

export async function loadCellOverride(
  mapId: string,
  q: number,
  r: number,
): Promise<CellOverride | null> {
  return (await loadCellObject(mapId, q, r)).override;
}

function parseOverride(raw: unknown): CellOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const out: CellOverride = {};
  const maxHp = Number(o.maxHp);
  if (Number.isFinite(maxHp) && maxHp > 0) out.maxHp = Math.floor(maxHp);
  const cost = Number(o.interactionCost);
  if (Number.isFinite(cost) && cost >= 0) out.interactionCost = cost;
  if (typeof o.badgeLabel === "string" && o.badgeLabel.trim()) {
    out.badgeLabel = o.badgeLabel.trim();
  }
  if (o.rewardConfig && typeof o.rewardConfig === "object") out.rewardConfig = o.rewardConfig;

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Накладывает на шаблон то, что задано КЛЕТКОЙ: её переопределения и фон боя
 * от типа местности.
 */
export function applyCellOverride(
  target: EncounterTarget,
  ov: CellOverride | null,
  terrainBg?: string | null,
): EncounterTarget {
  const backgroundUrl = pickBattleBg(target.backgroundUrl, terrainBg);
  if (!ov) {
    return backgroundUrl === target.backgroundUrl ? target : { ...target, backgroundUrl };
  }
  return {
    ...target,
    backgroundUrl,
    maxHp: ov.maxHp ?? target.maxHp,
    interactionCost: ov.interactionCost ?? target.interactionCost,
    badgeLabel: ov.badgeLabel ?? target.badgeLabel,
    rewardConfig: ov.rewardConfig ?? target.rewardConfig,
  };
}

/**
 * Фон окна боя: свой у объекта → фон типа местности → пусто (сцена рисует
 * штатную заливку, BossScene).
 *
 * Свой фон объекта остаётся главным намеренно: у боссов он проставлен у всех
 * до единого, и перебей его местностью — сменились бы фоны в уже идущих боях.
 * Хочешь местность — очисти фон у босса, и она подтянется сама.
 */
function pickBattleBg(own: string | null, terrainBg?: string | null): string | null {
  if (own && own.trim()) return own;
  const bg = terrainBg?.trim();
  return bg ? bg : null;
}
