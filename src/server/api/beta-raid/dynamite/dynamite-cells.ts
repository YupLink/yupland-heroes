// Подсветка окна «Бросить динамит» (lib/dynamite): 37 клеток в радиусе 3 от
// героя — можно ли бросить (клетка есть, не под куполом, не в городе — то же
// проверит бросок под локами) и что там заденет взрыв: шахта, у которой жизнь
// кончилась (тот же признак, что у броска, — raid_dynamite_mine_dead), у синего —
// чужой или ничей корабль (он будет разрушен; свой — нет, владелец 30.10.2026), моб
// или охрана, дерево или камень, у красного — вода (рыба, 30.10.2026) — значком на
// клетке. Один запрос на весь круг.
// Зелёная клетка — не обещание: бросок ещё раз проверит всё под локами.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { WATER_SQL } from "@/server/api/beta-raid/cell-sql";
import {
  DYNAMITE_RADIUS,
  dynamiteKindOf,
  dynamiteVerdict,
  hitOf,
  throwRows,
  type DynamiteCell,
  type DynamiteCellFlags,
  type DynamiteKind,
} from "@/lib/dynamite";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { playerCell } from "@/server/api/beta-raid/encounter-where";
import { pchestActor } from "@/server/api/beta-raid/plain-chest/pchest-row";
import { deadHpSql } from "@/server/api/beta-raid/runners";
import { loadInteractiveDecor } from "@/server/api/beta-raid/decor-interact-load";
import { blastableDecor } from "@/server/api/beta-raid/dynamite/dynamite-decor";

type Hex = { q: number; r: number };

/** Строка признаков клетки (декор — id шаблона: годность решает код). */
export type DynamiteCellRow = Omit<DynamiteCellFlags, "tree" | "ownShip"> & {
  q: number | string;
  r: number | string;
  decor: string | null;
  /** Синий: на клетке мой корабль. */
  own?: boolean | null;
};

/**
 * Шахта v2 клетки `c`, которую снесёт взрыв: жизнь кончилась (raid_dynamite_mine_dead —
 * срок вышел или ничья после поломки). Работающая и ничья с жизнью — нет.
 */
const DEAD_MINE = `(c.building_id IS NOT NULL
        AND COALESCE(c.building_config->>'effect',
                     (SELECT t.meta->>'effect' FROM yuplink.mystic_item_template t
                       WHERE t.id = c.building_id)) = 'mine'
        AND yuplink.raid_mine_v2_std(c.building_config) IS NOT NULL
        AND NOT yuplink.raid_mine_is_island(c.building_config)
        AND yuplink.raid_dynamite_mine_dead(c.map_id, c.q, c.r))`;

/**
 * Шахта клетки `c`, которую тронет синий (§8.75а): живая охрана (и у алмазной);
 * иначе не алмазная и не разрушенная (уровень −1 или руины); прежняя шахта — только
 * с хозяином (ничью разрушать нечего).
 */
const BLUE_MINE = `(yuplink.raid_dynamite_is_mine(c.building_id, c.building_config)
        AND NOT yuplink.raid_mine_is_island(c.building_config)
        AND yuplink.raid_mushroom_kind(c.building_config) IS NULL
        AND (EXISTS (SELECT 1 FROM yuplink.raid_mine_guard g
                         WHERE g.map_id = c.map_id AND g.q = c.q AND g.r = c.r
                           AND g.killed_at IS NULL AND g.current_hp > 0)
             OR (COALESCE(c.building_config->>'resource', '') <> 'diamonds'
                 AND CASE WHEN yuplink.raid_mine_v2_std(c.building_config) IS NOT NULL
                          THEN NOT yuplink.raid_dynamite_mine_dead(c.map_id, c.q, c.r)
                          ELSE EXISTS (SELECT 1 FROM yuplink.raid_mine_state s
                                        WHERE s.map_id = c.map_id AND s.q = c.q AND s.r = c.r)
                     END)))`;

/** Кто бросает: свой корабль — тот, чей владелец его аккаунт (или, у старых строк, кошелёк). */
export type DynamiteMe = { account: string; wallet: string };

/**
 * Синий (§8.75а, 26.10.2026): на клетке корабль, который взрыв разрушит, — чужой или
 * ничей (own = false); own = true — мой: синий его не трогает (владелец, 30.10.2026).
 * Без `me` — любой корабль, как прежде, а своих нет.
 */
export function shipSql(me: DynamiteMe | null, own: boolean): string {
  const at = `EXISTS (SELECT 1 FROM yuplink.beta_raid_ship s
                WHERE s.map_id = c.map_id AND s.q = c.q AND s.r = c.r`;
  if (!me) return own ? "false" : `${at})`;
  const who = `(${sqlStr(me.account)}, ${sqlStr(me.wallet)})`;
  return `${at}
                  AND ${own ? `s.owner IN ${who}` : `(s.owner IS NULL OR s.owner NOT IN ${who})`})`;
}

/** Красный (30.10.2026): клетка — вода (правило берега удочки), взрыв ловит рыбу. */
const WATER = `EXISTS (SELECT 1 FROM yuplink.mystic_item_template t
                 WHERE t.id = c.terrain_id AND ${WATER_SQL})`;

/** Живой моб/босс клетки, беглец под ним или живая охрана. */
const LIVE_MOB = `((c.object_id LIKE 'boss:%' AND NOT ${deadHpSql("c", 0)})
        OR EXISTS (SELECT 1 FROM yuplink.beta_raid_runner rn
                    WHERE rn.map_id = c.map_id AND rn.q = c.q AND rn.r = c.r
                      AND rn.object_id LIKE 'boss:%' AND NOT ${deadHpSql("rn", 1)})
        OR EXISTS (SELECT 1 FROM yuplink.raid_mine_guard g
                    WHERE g.map_id = c.map_id AND g.q = c.q AND g.r = c.r
                      AND g.killed_at IS NULL AND g.current_hp > 0))`;

/** Признаки клеток круга броска — один запрос. */
export function dynamiteCellsSql(
  mapId: string,
  at: Hex,
  radius = DYNAMITE_RADIUS,
  kind: DynamiteKind = "red",
  me: DynamiteMe | null = null,
): string {
  const [q, r] = [Math.trunc(at.q), Math.trunc(at.r)];
  const blue = kind === "blue";
  return `SELECT c.q, c.r, COALESCE(c.void_fog, false) AS dome,
            yuplink.raid_dynamite_in_town(c.map_id, c.q, c.r) AS town,
            ${blue ? BLUE_MINE : DEAD_MINE} AS mine,
            ${blue ? shipSql(me, false) : "false"} AS ship,
            ${blue ? shipSql(me, true) : "false"} AS own,
            ${blue ? "false" : WATER} AS water,
            ${LIVE_MOB} AS mob,
            c.decoration_id AS decor
       FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${sqlStr(mapId)}
        AND c.q BETWEEN ${q - radius} AND ${q + radius}
        AND c.r BETWEEN ${r - radius} AND ${r + radius}
        AND (abs(c.q - ${q}) + abs(c.r - ${r}) + abs(c.q + c.r - ${q + r})) / 2 <= ${radius};`;
}

/** Клетки окна рядами (throwRows); клетки нет в ответе — её нет на карте. */
export function dynamiteChoices(
  center: Hex,
  rows: readonly DynamiteCellRow[],
  tree: (decorId: string | null) => boolean,
): DynamiteCell[] {
  const byKey = new Map(rows.map((x) => [`${Number(x.q)},${Number(x.r)}`, x]));
  return throwRows().flatMap((row) =>
    row.map(({ dq, dr }) => {
      const x = byKey.get(`${center.q + dq},${center.r + dr}`);
      const f: DynamiteCellFlags | null = x
        ? {
            dome: !!x.dome,
            town: !!x.town,
            mine: !!x.mine,
            mob: !!x.mob,
            tree: tree(x.decor),
            ship: !!x.ship,
            ownShip: !!x.own,
            water: !!x.water,
          }
        : null;
      const reason = dynamiteVerdict(f);
      const cell: DynamiteCell = { dq, dr, ok: reason === null, reason, hit: hitOf(f) };
      return f?.ownShip ? { ...cell, ownShip: true } : cell;
    }),
  );
}

export type DynamiteCells = { center: Hex; cells: DynamiteCell[] };

/** Окно броска: круг радиуса 3 вокруг героя. Остров — отказ (там не бросают).
 *  stackKey — какой динамит (значок шахты у синего свой); нет — красный (старый клиент). */
export const getDynamiteCells = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({ stackKey: z.string().max(200).optional() })
      .optional()
      .parse(d),
  )
  .handler(async ({ data }): Promise<DynamiteCells> => {
    const a = await pchestActor(null);
    if (isIslandMapId(a.mapId)) throw new Error("dynamite.island");
    const pos = await playerCell(a.wallet);
    const center = { q: pos.q, r: pos.r };
    const kind = dynamiteKindOf(data?.stackKey) ?? "red";
    const me = { account: a.account, wallet: a.wallet };
    const [rows, list] = await Promise.all([
      mcpExec(dynamiteCellsSql(a.mapId, center, DYNAMITE_RADIUS, kind, me), {
        wrapJson: true,
      }) as Promise<DynamiteCellRow[] | null>,
      loadInteractiveDecor(),
    ]);
    const tree = (id: string | null) => !!id && blastableDecor(list[id], kind);
    return { center, cells: dynamiteChoices(center, rows ?? [], tree) };
  });
