// Этажи — карты с номером и названием, куда ведут порталы (владелец,
// 07.10.2026: «новый этаж = новая карта; можно задавать название — например,
// мир лабиринта»).
//
// Первый этаж — главный мир, с него начинают все. Новый этаж — любая готовая
// карта (из редактора или генератора миров): ей дают следующий номер и
// открывают для переходов (raid_maps.active — на закрытую карту портал не
// пускает). Снять этаж можно, пока на нём никто не стоит: карта остаётся
// черновиком, порталы туда отвечают «этаж закрыт».
//
// Комнаты порталов считаются по этажам — «2.3» значит этаж 2, комната 3
// (portal-rooms.ts).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireAdmin } from "../../auth";
import { activeBetaMapId, myMapId } from "./encounter-where";
import type { Floor, FloorPlaces } from "@/lib/portalFloors";

/** Внутрянка замка — не мир: этажом её не сделать. */
const NOT_A_WORLD = "castle_interior";

/** Открытые карты — этажи. На них стоят игроки и ведут порталы. */
export async function liveMapIds(): Promise<string[]> {
  const rows = (await mcpExec(`SELECT id FROM yuplink.raid_maps WHERE active ORDER BY id;`, {
    wrapJson: true,
  })) as Array<{ id: string }>;
  return (rows ?? []).map((r) => String(r.id));
}

/** Открыта ли карта для игроков (этаж, а не черновик). */
export async function isLiveMap(mapId: string): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT active FROM yuplink.raid_maps WHERE id = ${sqlStr(mapId)} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ active: boolean }>;
  return rows?.[0]?.active === true;
}

export async function listFloors(): Promise<Floor[]> {
  const rows = (await mcpExec(
    `SELECT f.map_id, f.num, f.name, m.name AS map_name
       FROM yuplink.raid_floor f JOIN yuplink.raid_maps m ON m.id = f.map_id
      ORDER BY f.num;`,
    { wrapJson: true },
  )) as Array<Record<string, unknown>>;
  return (rows ?? []).map((r) => ({
    mapId: String(r.map_id),
    num: Number(r.num),
    name: String(r.name),
    mapName: String(r.map_name),
  }));
}

/**
 * Карты, где у аккаунта может быть добыча: своя (где стоит) и все открытые
 * этажи. floor — название ДРУГОГО этажа для подписи; у своей — null.
 */
export async function floorMaps(
  here: string,
): Promise<Array<{ id: string; floor: string | null }>> {
  const floors = await listFloors().catch(() => [] as Floor[]);
  return [
    { id: here, floor: null },
    ...floors.filter((f) => f.mapId !== here).map((f) => ({ id: f.mapId, floor: f.name })),
  ];
}

/** Этажи, карты для нового этажа и карта, где настраивают портал. */
async function places(here: string): Promise<FloorPlaces> {
  const [floors, free] = await Promise.all([
    listFloors(),
    mcpExec(
      `SELECT m.id, m.name FROM yuplink.raid_maps m
        WHERE m.id <> ${sqlStr(NOT_A_WORLD)}
          AND NOT EXISTS (SELECT 1 FROM yuplink.raid_floor f WHERE f.map_id = m.id)
        ORDER BY m.created_at DESC NULLS LAST;`,
      { wrapJson: true },
    ) as Promise<Array<{ id: string; name: string }>>,
  ]);
  return { here, floors, free: (free ?? []).map((m) => ({ id: m.id, name: m.name })) };
}

const nameSchema = z.string().trim().min(1).max(40);

/**
 * mapId — карта, на которой настраивают портал (гекс-редактор шлёт свою);
 * пусто — та, где админ стоит (режим бога).
 */
export const adminPortalPlaces = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ mapId: z.string().min(1).optional() }).parse(d ?? {}))
  .handler(async ({ data }): Promise<FloorPlaces> => {
    const wallet = requireAdmin();
    return places(data.mapId ?? (await myMapId(wallet)));
  });

export const adminCreateFloor = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ here: z.string().min(1), mapId: z.string().min(1), name: nameSchema }).parse(d),
  )
  .handler(async ({ data }): Promise<FloorPlaces> => {
    const wallet = requireAdmin();
    // Номер и открытие — одним оператором: этаж без открытой карты (или
    // открытая карта без этажа) не остаётся ни на миг.
    const rows = (await mcpExec(
      `WITH f AS (
         INSERT INTO yuplink.raid_floor (map_id, num, name, created_by)
         SELECT m.id, COALESCE((SELECT max(num) FROM yuplink.raid_floor), 0) + 1,
                ${sqlStr(data.name)}, ${sqlStr(wallet)}
           FROM yuplink.raid_maps m
          WHERE m.id = ${sqlStr(data.mapId)} AND m.id <> ${sqlStr(NOT_A_WORLD)}
         ON CONFLICT DO NOTHING
         RETURNING map_id)
       UPDATE yuplink.raid_maps SET active = true
        WHERE id IN (SELECT map_id FROM f) RETURNING id;`,
      { wrapJson: false },
    )) as Array<{ id: string }>;
    if (!rows?.length) throw new Error("Эта карта уже этаж или её нет");
    await reserveFloorRewards(data.mapId);
    return places(data.here);
  });

/**
 * Награды открытого этажа — обещание игрокам: Darai под живые объекты
 * закладывается из пула, как при правке живой карты (map-darai-hold). Снимок
 * «до» — те же объекты без номинала: заложенное раньше (этаж снимали и
 * открыли снова) не двигается, новое закладывается. Снятие этажа закладку не
 * возвращает — объекты остаются на карте и ждут, когда её откроют снова.
 */
async function reserveFloorRewards(mapId: string): Promise<void> {
  const { readDaraiHold, settleDaraiHold } = await import("./map-darai-hold");
  const now = await readDaraiHold(mapId, null).catch(() => null);
  if (!now) return;
  const rows = new Map([...now.rows].map(([k, r]) => [k, { ...r, darai: 0 }]));
  await settleDaraiHold({ ...now, rows });
}

export const adminRenameFloor = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ here: z.string().min(1), mapId: z.string().min(1), name: nameSchema }).parse(d),
  )
  .handler(async ({ data }): Promise<FloorPlaces> => {
    requireAdmin();
    await mcpExec(
      `UPDATE yuplink.raid_floor SET name = ${sqlStr(data.name)} WHERE map_id = ${sqlStr(data.mapId)};`,
    );
    return places(data.here);
  });

/** Снять этаж: карта снова черновик. Главный мир и этаж с игроками не снимаются. */
export const adminDropFloor = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ here: z.string().min(1), mapId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }): Promise<FloorPlaces> => {
    requireAdmin();
    const main = await activeBetaMapId();
    if (data.mapId === main) throw new Error("Главный мир снять нельзя");
    const map = sqlStr(data.mapId);
    const rows = (await mcpExec(
      `WITH f AS (
         DELETE FROM yuplink.raid_floor fl
          WHERE fl.map_id = ${map}
            AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_positions p WHERE p.map_id = fl.map_id)
         RETURNING map_id)
       UPDATE yuplink.raid_maps SET active = false
        WHERE id IN (SELECT map_id FROM f) RETURNING id;`,
      { wrapJson: false },
    )) as Array<{ id: string }>;
    if (!rows?.length) {
      const left = (await mcpExec(
        `SELECT count(*)::int AS n FROM yuplink.beta_raid_positions WHERE map_id = ${map};`,
        { wrapJson: true },
      )) as Array<{ n: number }>;
      const n = Number(left?.[0]?.n ?? 0);
      throw new Error(n > 0 ? `На этаже стоят игроки: ${n}` : "Этот этаж уже снят");
    }
    return places(data.here);
  });
