// Снимок обеспечения наград: кто на карте сколько Darai держит.
//
// Вынесено из map-darai-hold.ts (правило ≤250 строк): там остались решения и
// проводки, здесь — чтение. Читаются ОБА слоя карты: объекты самих клеток и
// беглецы (runners.ts). Номинал держится за ОБЪЕКТОМ, а не за местом, поэтому
// расписка уезжает вместе с убежавшим грибом — иначе на его старой клетке
// осталось бы обещание без объекта, и первая же правка карты вернула бы деньги
// в пул, пока сам гриб продолжает обещать награду.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { CELL_LAYER, RUNNER_LAYER, type ObjectLayer } from "./runners";

export type HoldCell = { q: number; r: number };

/**
 * Судьба объекта:
 *  none   — объекта нет;
 *  alive  — стоит и ждёт игрока, значит обязан держать своё обеспечение;
 *  player — забрал игрок (killed_by заполняет только бой, см. encounter-hp);
 *  admin  — погашен админом, наград никто не получил.
 */
export type ObjectState = "none" | "alive" | "player" | "admin";

export type HoldRow = {
  q: number;
  r: number;
  /** Слой, на котором стоит объект: клетка или беглец. */
  layer: ObjectLayer;
  objectId: string | null;
  /** Расписка, которой объект держит пул сейчас. */
  ref: string | null;
  /** Сколько по этой расписке заложено. */
  held: number;
  /** Номинал награды объекта в Darai — сколько он обязан держать. */
  darai: number;
  state: ObjectState;
};

export type DaraiHoldSnapshot = {
  mapId: string;
  /** Клетки, за которыми следим; null — вся карта (полное сохранение). */
  cells: HoldCell[] | null;
  rows: Map<string, HoldRow>;
};

/** Ключ строки: у клетки и у стоящего на ней беглеца он разный. */
export const holdKey = (q: number, r: number, layer: ObjectLayer): string =>
  layer === RUNNER_LAYER ? `${q},${r}#run` : `${q},${r}`;

/**
 * Номинал Darai объекта — ровно тем же порядком, каким его выберет выдача
 * награды: настройки объекта (object_config) → шаблон босса → СНИМОК удалённого
 * шаблона → шаблон предмета. Считаем только наполнители вида «token» с символом
 * Darai.
 *
 * Снимок в этом списке обязателен: босс переживает удаление своей заготовки
 * (boss-snapshot), и без него удаление шаблона выглядело бы как «объект больше
 * ничего не должен» — обеспечение всех его копий разом вернулось бы в пул, пока
 * сами боссы на карте продолжают раздавать монеты.
 *
 * Проверки типа обязательны: вписанное руками «1 000» иначе роняло бы
 * приведением типа всю выгрузку правок целиком.
 */
const FILLERS_SQL = (o: string) => `CASE
    WHEN jsonb_typeof(${o}.object_config->'rewardConfig'->'fillers') = 'array'
      THEN ${o}.object_config->'rewardConfig'->'fillers'
    WHEN jsonb_typeof(bt.reward_tiers->'fillers') = 'array'
      THEN bt.reward_tiers->'fillers'
    WHEN jsonb_typeof(${o}.object_config->'tpl'->'rewardConfig'->'fillers') = 'array'
      THEN ${o}.object_config->'tpl'->'rewardConfig'->'fillers'
    WHEN jsonb_typeof(t.meta->'rewardConfig'->'fillers') = 'array'
      THEN t.meta->'rewardConfig'->'fillers'
    ELSE '[]'::jsonb END`;

const AMOUNT_SQL = `CASE
      WHEN jsonb_typeof(f->'amount') = 'number' THEN (f->>'amount')::numeric
      WHEN COALESCE(f->>'amount', '') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (f->>'amount')::numeric
      ELSE 0 END`;

/** Шаблоны объекта — общие для обоих слоёв (алиасы bt и t жёстко ждут ниже). */
const TEMPLATE_JOIN = (o: string) => `LEFT JOIN yuplink.raid_boss_template bt
                ON ${o}.object_id LIKE 'boss:%' AND bt.id = split_part(${o}.object_id, ':', 2)
         LEFT JOIN yuplink.mystic_item_template t
                ON t.id = CASE WHEN ${o}.object_id LIKE '%:%'
                               THEN split_part(${o}.object_id, ':', 2) ELSE ${o}.object_id END`;

/** Одна половина запроса: слой клеток или слой беглецов. */
function layerSql(mapId: string, cells: HoldCell[] | null, layer: ObjectLayer): string {
  const runner = layer === RUNNER_LAYER;
  const table = runner ? "yuplink.beta_raid_runner" : "yuplink.raid_map_cells";
  const o = runner ? "rn" : "c";
  const scope = cells
    ? `AND (${o}.q, ${o}.r) IN (${cells
        .map((x) => `(${Math.floor(x.q)}, ${Math.floor(x.r)})`)
        .join(",")})`
    : "";
  // У беглеца объект есть всегда: строка слоя без объекта не заводится.
  const state = `CASE ${runner ? "" : `WHEN ${o}.object_id IS NULL THEN 'none'`}
                      WHEN hp.killed_at IS NULL THEN 'alive'
                      WHEN hp.killed_by IS NULL THEN 'admin'
                      ELSE 'player' END`;
  return `SELECT ${o}.q, ${o}.r, ${layer} AS layer, ${o}.object_id, ${o}.darai_ref,
              COALESCE(${o}.darai_hold, 0)::text AS held,
              (SELECT COALESCE(SUM(${AMOUNT_SQL}), 0)
                 FROM jsonb_array_elements(${FILLERS_SQL(o)}) f
                WHERE f->>'kind' = 'token'
                  AND lower(COALESCE(f->>'token', '')) = 'darai')::text AS darai,
              ${state} AS state
         FROM ${table} ${o}
         ${TEMPLATE_JOIN(o)}
         LEFT JOIN yuplink.beta_raid_object_hp hp
                ON hp.map_id = ${o}.map_id AND hp.q = ${o}.q AND hp.r = ${o}.r
               AND hp.cycle_no = ${layer}
        WHERE ${o}.map_id = ${sqlStr(mapId)} ${scope}`;
}

/** Снять снимок обеспечения по клеткам — до правки и повторно после неё. */
export async function readDaraiHold(
  mapId: string,
  cells: HoldCell[] | null,
): Promise<DaraiHoldSnapshot> {
  const rows = new Map<string, HoldRow>();
  if (cells && cells.length === 0) return { mapId, cells, rows };

  // Объекты без награды и без расписки не отвечают ни за что: на боевой карте
  // таких тысячи, и тащить их через мост незачем — отсюда фильтр снаружи.
  const out = (await mcpExec(
    `SELECT * FROM (
       ${layerSql(mapId, cells, CELL_LAYER)}
       UNION ALL
       ${layerSql(mapId, cells, RUNNER_LAYER)}) s
      WHERE s.darai_ref IS NOT NULL OR s.darai::numeric > 0;`,
    { wrapJson: true },
  )) as Array<{
    q: number;
    r: number;
    layer: number;
    object_id: string | null;
    darai_ref: string | null;
    held: string;
    darai: string;
    state: ObjectState;
  }>;

  for (const row of out ?? []) {
    const q = Number(row.q);
    const r = Number(row.r);
    const layer: ObjectLayer = Number(row.layer) === RUNNER_LAYER ? RUNNER_LAYER : CELL_LAYER;
    rows.set(holdKey(q, r, layer), {
      q,
      r,
      layer,
      objectId: row.object_id ?? null,
      ref: row.darai_ref ?? null,
      held: Number(row.held) || 0,
      darai: Number(row.darai) || 0,
      state: row.state,
    });
  }
  return { mapId, cells, rows };
}
