// Портал и корабль: судно проходит переход вместе с капитаном.
//
// Раньше портал просто ссаживал экипаж (releaseShip) и переносил игрока. Если
// выход стоял на воде, игрок оказывался посреди моря без лодки: шаг с воды
// требует судна, а судно осталось у входа — глухой тупик (жалоба 06.09.2026).
//
// Правила те же, что у обычного плавания: судно живёт только на воде, малому
// кораблю океан заказан. Чужой борт на клетке выхода не мешает (владелец,
// 27.09: корабль ставится и туда, где уже стоит корабль). Отсюда три исхода:
//   sailed — выход водный и годный: судно едет на клетку выхода, игрок на борту;
//   docked — выход на суше: судно встаёт на ближайшую воду, игрок сходит;
//   left   — везти некуда: судно остаётся у входа и снова свободно.
//
// Пешего портал пропускает так же, без всяких запретов: в водном выходе он
// либо садится в стоящее там свободное судно, либо выходит на ближайший берег.
// Оставлять его в воде нельзя — это тот самый тупик, только с другой стороны.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { raidOwner } from "./owner";
import { WATER_SQL, OCEAN_SQL } from "./cell-sql";
import { freeWaterAround } from "./ships";
import { nearestLand } from "./ship-rescue";
import { chargeShipHp, releaseShip, seatOnShip, type MyShip } from "./ship-crew";
import { SHIP_ASHORE_HP, SHIP_BOARD_HP } from "@/lib/shipHealth";

export type PortalShip = { exitWater: boolean; ship: MyShip | null };
export type CarryMode = "sailed" | "docked" | "left" | "none";

/**
 * Что важно знать до оплаты: водный ли выход и есть ли под игроком судно.
 * Один запрос на оба вопроса — вход в портал и так не бесплатный по времени.
 */
export async function portalShipContext(
  wallet: string,
  mapId: string,
  exit: { q: number; r: number },
): Promise<PortalShip> {
  const acc = sqlStr(await raidOwner(wallet));
  const rows = (await mcpExec(
    `SELECT ex.water AS exit_water, s.id, s.q, s.r, s.kind
       FROM (SELECT EXISTS (SELECT 1 FROM yuplink.raid_map_cells c
                              JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
                             WHERE c.map_id = ${sqlStr(mapId)}
                               AND c.q = ${exit.q} AND c.r = ${exit.r}
                               AND ${WATER_SQL}) AS water) ex
       LEFT JOIN LATERAL (
            SELECT id, q, r, kind FROM yuplink.beta_raid_ship
             WHERE crew_account = ${acc} AND map_id = ${sqlStr(mapId)}
             ORDER BY updated_at DESC LIMIT 1) s ON true;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<Record<string, unknown>>;
  const row = rows?.[0];
  const ship: MyShip | null = row?.id
    ? {
        id: String(row.id),
        q: Number(row.q),
        r: Number(row.r),
        kind: row.kind === "big" ? "big" : "small",
      }
    : null;
  return { exitWater: !!row?.exit_water, ship };
}

/**
 * Клетка годится этому судну: вода, малому — не океан. Другие суда на ней не
 * мешают — прежнее «свободна от других» высаживало капитана на берег и
 * бросало его корабль у входа, стоило у выхода стоять чужому борту.
 */
const berthSql = (mapId: string, q: number, r: number, kind: "small" | "big") =>
  `EXISTS (SELECT 1 FROM yuplink.raid_map_cells c
             JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
            WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${q} AND c.r = ${r}
              AND ${WATER_SQL} ${kind === "small" ? `AND NOT ${OCEAN_SQL}` : ""})`;

/**
 * Переход с судном. Позиция игрока и переезд судна пишутся ОДНИМ оператором:
 * на воду игрок попадает только вместе с лодкой, иначе не попадает вовсе.
 * Возвращает исход и признак, что позиция записана.
 */
export async function movePlayerThroughPortal(
  wallet: string,
  mapId: string,
  exit: { q: number; r: number },
  ctx: PortalShip,
  /**
   * carryShip=false — судно остаётся там, где стояло. Нужно заклинанию
   * переноса к замку: оно обещает перенести ГЕРОЯ, а подтянутый через всю
   * карту борт был бы вторым, необещанным призывом корабля. Высадка и износ
   * при этом идут как обычно — брошенным экипажем судно не остаётся.
   */
  opts: { carryShip?: boolean } = {},
): Promise<{ moved: boolean; mode: CarryMode }> {
  const acc = sqlStr(await raidOwner(wallet));
  // Позиция всегда пишется с картой выхода: свой этаж — та же карта, другой
  // (портал между этажами) — новая. Строка без карты читалась бы главным миром
  // (pos-map-sql). Корабль между картами не переносится (такой переход зовётся
  // с ctx.ship=null), поэтому плавание ниже — только в пределах этажа.
  const m = sqlStr(mapId);
  const pos = (from: string) =>
    `INSERT INTO yuplink.beta_raid_positions (account_id, q, r, updated_at, map_id)
     ${from}
     ON CONFLICT (account_id) DO UPDATE
       SET q = EXCLUDED.q, r = EXCLUDED.r, updated_at = now(), map_id = EXCLUDED.map_id
     RETURNING account_id`;
  const at = (q: number, r: number) => `VALUES (${acc}, ${q}, ${r}, now(), ${m})`;
  const write = async (sql: string): Promise<boolean> => {
    const rows = (await mcpExec(sql, { wrapJson: false })) as Array<unknown>;
    return (rows?.length ?? 0) > 0;
  };

  // Выход на воде и судно под ногами — плывём вместе, одним оператором:
  // позиция пишется, ТОЛЬКО если судно доехало.
  if (ctx.ship && ctx.exitWater) {
    const rows = (await mcpExec(
      `WITH sh AS (
         UPDATE yuplink.beta_raid_ship SET q = ${exit.q}, r = ${exit.r}, updated_at = now()
          WHERE id = ${sqlStr(ctx.ship.id)} AND crew_account = ${acc}
            AND ${berthSql(mapId, exit.q, exit.r, ctx.ship.kind)}
         RETURNING id),
       p AS (${pos(`SELECT ${acc}, ${exit.q}, ${exit.r}, now(), ${m} FROM sh`)})
       SELECT (SELECT count(*) FROM p)::int AS moved;`,
      { wrapJson: false },
    )) as Array<{ moved: number }>;
    if (Number(rows?.[0]?.moved) > 0) return { moved: true, mode: "sailed" };
    // Клетка выхода судну не подошла (малому — океан). Переход всё равно
    // состоится: игрока высадим, как пешего.
  }

  // Водный выход без своего борта: сажаем в свободное судно на месте, а нет
  // его — выводим на ближайший берег. Стоять в воде игрок не должен: оттуда
  // ногами не уйти, и получается тот самый тупик.
  if (ctx.exitWater) {
    if (!ctx.ship) {
      const seat = await seatOnShip(wallet, mapId, exit.q, exit.r);
      if (seat) {
        // Посадка есть посадка, даже если случилась на выходе из портала.
        await chargeShipHp(seat.id, SHIP_BOARD_HP).catch(() => {});
        return { moved: await write(`${pos(at(exit.q, exit.r))};`), mode: "sailed" };
      }
    } else {
      await chargeShipHp(ctx.ship.id, SHIP_ASHORE_HP).catch(() => {});
      await releaseShip(wallet).catch(() => {});
    }
    const land = (await nearestLand(mapId, exit.q, exit.r)) ?? exit;
    return { moved: await write(`${pos(at(land.q, land.r))};`), mode: ctx.ship ? "left" : "none" };
  }

  // Выход на суше: игрок сходит на берег, судно подтягиваем к ближайшей воде
  // рядом с выходом — «корабль пришёл за героем».
  let mode: CarryMode = ctx.ship ? "left" : "none";
  if (ctx.ship) {
    const spot =
      opts.carryShip === false
        ? null
        : await freeWaterAround(mapId, exit.q, exit.r, false, ctx.ship.kind);
    if (spot) {
      await mcpExec(
        `UPDATE yuplink.beta_raid_ship SET q = ${spot.q}, r = ${spot.r}, updated_at = now()
          WHERE id = ${sqlStr(ctx.ship.id)} AND crew_account = ${acc};`,
      );
      mode = "docked";
    }
    // На берегу экипажа нет: борт снова свободен, где бы он ни встал. Сход
    // стоит судну столько же, сколько обычная высадка.
    await chargeShipHp(ctx.ship.id, SHIP_ASHORE_HP).catch(() => {});
    await releaseShip(wallet).catch(() => {});
  }
  return { moved: await write(`${pos(at(exit.q, exit.r))};`), mode };
}

/**
 * Переход на другой этаж: судно туда не едет — остаётся у входа и снова
 * свободно. Сход стоит ему столько же, сколько обычная высадка. Без этого
 * игрок числился бы экипажем борта, оставшегося на прежней карте. true —
 * игрок был на борту.
 */
export async function leaveShipBehind(wallet: string): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT id FROM yuplink.beta_raid_ship
      WHERE crew_account = ${sqlStr(await raidOwner(wallet))} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ id: string }>;
  const id = rows?.[0]?.id;
  if (!id) return false;
  await chargeShipHp(String(id), SHIP_ASHORE_HP).catch(() => {});
  await releaseShip(wallet).catch(() => {});
  return true;
}
