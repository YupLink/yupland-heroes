// Комнаты порталов — связки по этажам (владелец, 07.10.2026: «комнаты m.1–m.n,
// где m — этаж»).
//
// Комната — номер сети в настройке портала (portal.group) на этаже
// portal.targetMap (пусто — на своём). Порталы одной комнаты связаны, на каком
// бы этаже ни стояли (portal-exits). Имя и преднастройки (цена, уровни) у
// комнаты свои на каждом этаже: выбрал комнату у нового портала — форма
// заполнилась. Цифра «3» через месяц не расскажет, что это была за комната,
// поэтому имя дают один раз, а дальше выбирают из списка.
//
// Раньше это был один словарь сетей на всю игру (settings.portal_group_names);
// миграция floor-01 разнесла его по этажам.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireAdmin } from "../../auth";
import { ROOM_MAP_SQL } from "./portal-exits";
import type { PortalGroup, PortalGroupNames } from "@/lib/portal";
import type { PortalRooms } from "@/lib/portalFloors";

/** Имена и преднастройки комнат этажа. Пусто — ни одной не назвали. */
export async function roomNames(mapId: string): Promise<PortalGroupNames> {
  const rows = (await mcpExec(
    `SELECT num, name, tpl FROM yuplink.raid_portal_room WHERE map_id = ${sqlStr(mapId)};`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ num: number; name: string; tpl: unknown }>;
  const out: PortalGroupNames = {};
  for (const r of rows ?? []) {
    const name = String(r.name ?? "").trim();
    if (!name) continue;
    const t = (r.tpl && typeof r.tpl === "object" ? r.tpl : {}) as Partial<PortalGroup>;
    out[String(r.num)] = {
      name: name.slice(0, 40),
      prices: Array.isArray(t.prices) ? t.prices : undefined,
      levelFromOn: t.levelFromOn,
      levelFrom: t.levelFrom,
      levelToOn: t.levelToOn,
      levelTo: t.levelTo,
      moveEnergyMinOn: t.moveEnergyMinOn,
      moveEnergyMin: t.moveEnergyMin,
    };
  }
  return out;
}

/** Сколько порталов в каждой комнате этажа — со всех этажей сразу. */
async function roomCounts(mapId: string): Promise<Record<string, number>> {
  const rows = (await mcpExec(
    `SELECT c.building_config->'portal'->>'group' AS num, count(*)::int AS n
       FROM yuplink.raid_map_cells c
      WHERE c.building_config ? 'portal'
        AND (c.building_config->'portal'->>'group') ~ '^[1-9][0-9]{0,2}$'
        AND ${ROOM_MAP_SQL("c")} = ${sqlStr(mapId)}
      GROUP BY 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ num: string; n: number }>;
  return Object.fromEntries((rows ?? []).map((r) => [String(r.num), Number(r.n)]));
}

async function roomsOf(mapId: string): Promise<PortalRooms> {
  const [names, counts] = await Promise.all([roomNames(mapId), roomCounts(mapId)]);
  return { names, counts };
}

export const adminPortalRooms = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ mapId: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<PortalRooms> => {
    requireAdmin();
    return roomsOf(data.mapId);
  });

// Строка цены целиком: у оплаты товаром без ключа стека и имени шаблон
// подставлял бы новому порталу пустую строку «товар ×1».
const priceSchema = z.object({
  resource: z.string().min(1).max(16),
  token: z.string().max(24).nullable().optional(),
  itemKey: z.string().max(160).nullable().optional(),
  itemName: z.string().max(80).nullable().optional(),
  amount: z.number().nonnegative(),
});

/**
 * Запомнить комнату этажа: имя и преднастройки, которые подставятся следующему
 * порталу этой комнаты. Пустое имя стирает запись: так админ убирает
 * ошибочную, не заводя отдельной кнопки удаления.
 */
export const adminSavePortalRoom = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        mapId: z.string().min(1),
        group: z.number().int().min(1).max(999),
        name: z.string().max(40),
        prices: z.array(priceSchema).max(8).optional(),
        levelFromOn: z.boolean().optional(),
        levelFrom: z.number().int().min(1).max(100).optional(),
        levelToOn: z.boolean().optional(),
        levelTo: z.number().int().min(1).max(100).optional(),
        moveEnergyMinOn: z.boolean().optional(),
        moveEnergyMin: z.number().int().min(0).max(1_000_000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<PortalRooms> => {
    requireAdmin();
    const { mapId, group, name: raw, ...tpl } = data;
    const name = raw.trim();
    const map = sqlStr(mapId);
    await mcpExec(
      name
        ? `INSERT INTO yuplink.raid_portal_room (map_id, num, name, tpl, updated_at)
           VALUES (${map}, ${group}, ${sqlStr(name)}, ${sqlStr(JSON.stringify(tpl))}::jsonb, now())
           ON CONFLICT (map_id, num) DO UPDATE
             SET name = EXCLUDED.name, tpl = EXCLUDED.tpl, updated_at = now();`
        : `DELETE FROM yuplink.raid_portal_room WHERE map_id = ${map} AND num = ${group};`,
    );
    return roomsOf(mapId);
  });
