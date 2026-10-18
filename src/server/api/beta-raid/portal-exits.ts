// Куда может вывести портал: другие порталы той же комнаты.
//
// Комната — номер сети (building_config.portal.group) на этаже
// portal.targetMap; пусто — на своём этаже (владелец, 07.10.2026: комнаты
// «m.1–m.n», где m — этаж). Порталы одной комнаты связаны, на каком бы этаже
// ни стояли: портал первого этажа в комнате «2.1» и порталы второго этажа в
// ней же ведут друг в друга. Ноль не комната, а дверь: она никуда не ведёт,
// поэтому её здесь нет вовсе.
//
// Выход выбирается СЛУЧАЙНО и на сервере: клиенту дают только число выходов.
// Иначе игрок видел бы карту сети целиком, включая места, куда сам ещё не
// доходил, — по сути бесплатную разведку.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { PORTAL_DOOR, type PortalConfig } from "@/lib/portal";
import { DOOR_SQL } from "./gate-sql";

export type PortalRoom = { mapId: string; group: number };
export type PortalExit = { mapId: string; q: number; r: number };

/** Этаж комнаты портала клетки `c` (SQL): назначенный или свой. */
export const ROOM_MAP_SQL = (c: string) =>
  `COALESCE(NULLIF(btrim(${c}.building_config->'portal'->>'targetMap'), ''), ${c}.map_id)`;

/** Комната портала, стоящего на карте mapId. */
export const roomOf = (cfg: PortalConfig, mapId: string): PortalRoom => ({
  mapId: cfg.targetMap ?? mapId,
  group: cfg.group,
});

/**
 * Порталы комнаты на открытых этажах, кроме входного. Закрытая карта
 * (черновик) выходом не бывает: туда игроков не пускают.
 *
 * Портал определяем ТАК ЖЕ, как код (cellBuildingEffect): сначала эффект,
 * назначенный самой клетке в режиме бога, и только потом шаблон. Иначе
 * табличка, которой админ назначил роль портала, работала входом (вход читает
 * эффект клетки), но выходом не считалась — и сеть не собиралась вовсе.
 */
export async function portalExits(room: PortalRoom, from: PortalExit): Promise<PortalExit[]> {
  if (room.group === PORTAL_DOOR) return [];
  const rows = (await mcpExec(
    `SELECT c.map_id, c.q, c.r
       FROM yuplink.raid_map_cells c
       JOIN yuplink.raid_maps m ON m.id = c.map_id AND m.active
       JOIN yuplink.mystic_item_template t ON t.id = c.building_id
      WHERE c.building_id IS NOT NULL
        AND (
          c.building_config->>'effect' = 'portal'
          OR (
            (c.building_config->>'effect') IS NULL
            AND (t.meta->>'effect' = 'portal' OR t.name ~* '(портал|телепорт|врат|portal)')
          )
        )
        AND (c.building_config->'portal'->>'group') = '${Math.round(room.group)}'
        AND ${ROOM_MAP_SQL("c")} = ${sqlStr(room.mapId)}
        AND NOT (c.map_id = ${sqlStr(from.mapId)}
                 AND c.q = ${Math.round(from.q)} AND c.r = ${Math.round(from.r)})
        -- Дверь выходом быть не может: она и так группа 0, но условие оставим
        -- явным — сеть меняют руками, и опечатка в номере не должна выкидывать
        -- игрока за платный шлагбаум бесплатно.
        AND NOT ${DOOR_SQL("c")};`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ map_id: string; q: number; r: number }>;
  return (rows ?? []).map((r) => ({ mapId: String(r.map_id), q: Number(r.q), r: Number(r.r) }));
}

/** Случайный выход. Пусто — в комнате один портал, идти некуда. */
export function pickExit(cells: PortalExit[]): PortalExit | null {
  if (cells.length === 0) return null;
  return cells[Math.floor(Math.random() * cells.length)];
}
