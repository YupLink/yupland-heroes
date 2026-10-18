// Всё, что нужно знать о ЦЕЛЕВОЙ клетке шага, — одним запросом.
//
// Раньше на один тап по гексу та же клетка спрашивалась ПЯТЬ раз подряд:
// проходимость (helpers.isValidMove), жив ли объект на ней, вода ли это
// (ship-move.isWaterCell), цена (getMoveCost + cellMoveCost) и причалы ВСЕЙ
// карты (ships.loadShipCells) ради одной-единственной клетки. На боевой базе
// каждый такой вопрос — сетевой рейс через MCP-SSE, и шаг набирал их полтора
// десятка.
//
// Правила при этом НЕ переписаны: цена берётся общим CELL_COST_SQL (тем же,
// что у схода на берег), вода — общим WATER_SQL, а «жив ли объект» уезжает
// наверх сырыми полями, чтобы сравнение осталось ровно тем же, что было в JS.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { CELL_COST_JOIN, CELL_COST_SQL, WATER_SQL, OCEAN_SQL, decorBlocksSql } from "./cell-sql";
import { VOID_SQL } from "./voidCells";
import { canIgnoreVoid } from "./voidGate";
import { objectKnownSql } from "./boss-snapshot";
import { buildingEffect, isBuilt } from "@/lib/buildingEffect";
import { isDoor, portalConfig, type PortalConfig } from "@/lib/portal";

/** Причал на клетке: сколько судов и сколько из них с экипажем. */
export type BerthFacts = { ships: number; busy: number; crew: string[] };

export type StepFacts = {
  terrainId: string | null;
  decorationId: string | null;
  /** Декор держит клетку. См. Row.decoration_blocks. */
  decorationBlocks: boolean;
  objectId: string | null;
  /**
   * Есть ли чем показать этот объект: жив его шаблон или снят снимок клетки.
   * Мёртвая ссылка клетку не держит — см. stepBlockedReason.
   */
  objectKnown: boolean;
  voidFog: boolean;
  /** Нашлась ли строка HP объекта (cycle_no = 0) — как `hpRows.length` раньше. */
  hpFound: boolean;
  hpValue: number | null;
  water: boolean;
  /** Океан — глубокая вода: пройдёт только большой корабль. */
  ocean: boolean;
  /** Цена шага на эту клетку без надбавок и скидок. */
  cost: number;
  /** null — судов на клетке нет (раньше это был «не нашли клетку в списке»). */
  berth: BerthFacts | null;
  /**
   * Дверь-шлагбаум на клетке: настройка портала группы 0 у достроенной
   * постройки. Едет в тех же фактах, что и всё остальное про клетку, —
   * отдельный запрос стоил бы ещё одного сетевого рейса на каждый шаг.
   */
  gate: GateFacts | null;
};

/** Что дверь спрашивает у входящего. */
export type GateFacts = {
  /** Настройка портала как её задал админ. */
  config: PortalConfig;
  /** Имя постройки — попадает в текст отказа. */
  name: string;
};

type Row = {
  terrain_id: string | null;
  decoration_id: string | null;
  /**
   * Держит ли декор клетку (decorBlocksSql): шаблон ЕСТЬ и не проходим.
   * meta.walkable=true в шаблоне пускает игрока на клетку (таблички, знаки,
   * коврики — жалоба владельца 14.09 про табличку у корабля); удалённый
   * шаблон клетку не держит — иначе мёртвая ссылка запирала проход навсегда
   * («две мёртвые клетки» 20.09).
   */
  decoration_blocks: boolean | null;
  object_id: string | null;
  object_known: boolean | null;
  void_fog: boolean | null;
  hp_found: boolean | null;
  hp_value: number | string | null;
  water: boolean | null;
  ocean: boolean | null;
  cost: number | string | null;
  ships: number | null;
  busy: number | null;
  crew: unknown;
  building_config: unknown;
  building_name: string | null;
  building_effect: string | null;
  building_tiers: number | null;
  building_tier: number | null;
};

/**
 * Снимок клетки. null — клетки нет в таблице вовсе (для проходимости это то же
 * самое, что «нет местности»).
 *
 * Причал считает занятость по ЭКИПАЖУ самих судов. Раньше суда соединялись с
 * игроками по координатам — и заняты были те, на чьей клетке кто-то стоит.
 * Позиция хранится без карты, так что игрок с теми же координатами ДРУГОЙ
 * карты занимал здешний борт; а сестринский кошелёк того же аккаунта из счёта
 * выбрасывался, и две сестры садились на одно судно. Так же считает
 * ships.loadShipCells — правило посадки живёт по всей карте одинаково.
 */
export async function loadStepFacts(
  mapId: string,
  q: number,
  r: number,
): Promise<StepFacts | null> {
  const rows = (await mcpExec(
    `SELECT c.terrain_id, c.decoration_id, c.object_id, ${VOID_SQL} AS void_fog,
            ${objectKnownSql("c")} AS object_known,
            (hp.found IS TRUE) AS hp_found, hp.current_hp AS hp_value,
            ${WATER_SQL} AS water, ${OCEAN_SQL} AS ocean, ${CELL_COST_SQL} AS cost,
            berth.ships, berth.busy, berth.crew,
            ${decorBlocksSql("c")} AS decoration_blocks,
            c.building_config, bt.name AS building_name,
            bt.meta->>'effect' AS building_effect,
            CASE WHEN jsonb_typeof(bt.meta->'tiers') = 'array'
                 THEN jsonb_array_length(bt.meta->'tiers') ELSE 0 END AS building_tiers,
            COALESCE(bs.tier, 0) AS building_tier
       FROM yuplink.raid_map_cells c
       LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
       ${CELL_COST_JOIN}
       LEFT JOIN LATERAL (
         SELECT h.current_hp, true AS found
           FROM yuplink.beta_raid_object_hp h
          WHERE h.map_id = c.map_id AND h.q = c.q AND h.r = c.r AND h.cycle_no = 0
          LIMIT 1
       ) hp ON true
       LEFT JOIN yuplink.mystic_item_template bt ON bt.id = c.building_id
       LEFT JOIN yuplink.beta_raid_building_state bs
              ON bs.map_id = c.map_id AND bs.q = c.q AND bs.r = c.r
       LEFT JOIN LATERAL (
         -- Разбитые борта (запас хода кончился, экипаж сошёл) в счёт не идут:
         -- сесть на них нельзя, и обещать шаг-посадку по ним тоже нельзя.
         SELECT count(*)::int AS ships,
                count(s.crew_account)::int AS busy,
                COALESCE(array_agg(s.crew_account) FILTER (WHERE s.crew_account IS NOT NULL), '{}')
                  AS crew
           FROM yuplink.beta_raid_ship s
          WHERE s.map_id = c.map_id AND s.q = c.q AND s.r = c.r
            AND (s.hp > 0 OR s.crew_account IS NOT NULL)
       ) berth ON true
      WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${q} AND c.r = ${r}
      LIMIT 1;`,
    { wrapJson: true },
  )) as Row[];

  const row = rows?.[0];
  if (!row) return null;
  const ships = Number(row.ships) || 0;
  return {
    terrainId: row.terrain_id ?? null,
    decorationId: row.decoration_id ?? null,
    decorationBlocks: !!row.decoration_blocks,
    objectId: row.object_id ?? null,
    objectKnown: !!row.object_known,
    voidFog: !!row.void_fog,
    hpFound: !!row.hp_found,
    hpValue: row.hp_value === null || row.hp_value === undefined ? null : Number(row.hp_value),
    water: !!row.water,
    ocean: !!row.ocean,
    cost: Number(row.cost) || 1,
    berth:
      ships > 0
        ? {
            ships,
            busy: Number(row.busy) || 0,
            crew: Array.isArray(row.crew) ? row.crew.map(String) : [],
          }
        : null,
    gate: gateOf(row),
  };
}

/**
 * Дверь на клетке — или null.
 *
 * Считается дверью только достроенная постройка-портал с группой 0. Портал
 * сети (группа больше нуля) шаг не трогает: в него входят кнопкой, а не
 * наступая, — иначе игрок телепортировался бы, просто проходя мимо.
 */
function gateOf(row: Row): GateFacts | null {
  // Шлагбаум — сухопутный. На воде игрок и так не ходит ногами: туда попадают
  // посадкой на судно, а та идёт своим путём и плату бы не взяла — то есть
  // «дверь на воде» была бы дырой, а не механикой.
  if (row.water) return null;
  const effect = buildingEffect({ effect: row.building_effect }, row.building_name ?? "");
  if (effect !== "portal") return null;
  const tiers = Number(row.building_tiers) || 0;
  if (!isBuilt(Number(row.building_tier) || 0, tiers)) return null;
  const config = portalConfig(row.building_config);
  if (!isDoor(config)) return null;
  return { config, name: row.building_name ?? "Дверь" };
}

/**
 * Почему на клетку нельзя (null — можно). Порядок отказов ровно тот, что был в
 * helpers.isValidMove: местность → глухой туман → декор → живой объект.
 *
 * Глухой туман — стена, но только для игрока: админ ходит по своей зоне ногами,
 * иначе её нечем проверить. Отвечаем КЛЮЧОМ словаря: текст игрок увидит на
 * своём языке (serverErrorText), а не по-русски.
 */
export function stepBlockedReason(facts: StepFacts | null, wallet: string | null): string | null {
  if (!facts || !facts.terrainId) return "Здесь нет местности — пройти нельзя";
  if (facts.voidFog && !canIgnoreVoid(wallet)) return "braid.void_blocked";
  // Декор = преграда. Именно декором на карте выкладывают непроходимые зоны.
  // Исключение — meta.walkable=true у шаблона (таблички, знаки, коврики):
  // владелец 14.09 — «нажимая на табличку можно только причитать, дайте
  // подойти к кораблю сквозь неё». И — как у объекта ниже — только пока
  // шаблон ЕСТЬ: мёртвую ссылку декора решает SQL (decorBlocksSql), здесь
  // она уже «не держит».
  if (facts.decorationBlocks) return "Здесь преграда — пройти нельзя";
  // Объект держит клетку, только пока ЖИВ. Повержённый (HP = 0) проход не
  // закрывает — иначе разбитый сундук навсегда перекрывал дорогу.
  //
  // И только пока ЕСТЬ: удалённый шаблон оставлял на клетке мёртвую ссылку, и
  // она запирала проход навсегда — ни имени, ни картинки, ни кнопки, обойти
  // нечем. Такую клетку пропускаем, будто объекта на ней нет (его и нет).
  if (facts.objectId && facts.objectKnown) {
    const alive = !facts.hpFound || Number(facts.hpValue) > 0;
    if (alive) return "Объект блокирует путь — сначала разберись с ним";
  }
  return null;
}
