// Привязка лавки к ратуше (владелец, 04.10.2026): галочка в настройке лавки и
// выбор ратуши списком — от ближней к дальней. Зоны города больше нет.
//
// Привязанная лавка торгует своими позициями, которые есть в ратуше, по её
// складу и цене (town-shop.ts); без галочки — ровно тем, что в самой лавке.
// Расстояние не ограничено: лавку на другом краю карты можно сделать частью
// экономики далёкого города — склад у города один на все его лавки.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireAdmin } from "../../auth";
import { hexDistance } from "@/lib/raid/hex";
import { cleanTownName } from "@/lib/townConfig";
import type { TownKey } from "./town-stock";
import { requireGodAdmin } from "@/server/api/beta-raid/island/island-editor-auth";

/** Ратуша в списке выбора: где стоит, как зовётся и сколько до неё клеток. */
export type TownHallOption = {
  q: number;
  r: number;
  /** Название города из пульта ратуши («Город Вихоток»); null — не задано. */
  title: string | null;
  /** Имя постройки на клетке ратуши. */
  name: string;
  /** Местность под ратушей — по ней ратуши и узнают («Город Кабанов»). */
  land: string | null;
  residents: number;
  dist: number;
};

export type ShopTownBinding = {
  town: { q: number; r: number } | null;
  halls: TownHallOption[];
};

/**
 * Ратуша, к которой привязана лавка. null — лавка сама по себе (или её ратуши
 * уже нет в реестре). Сбой базы — бросок: сделку он должен остановить, а не
 * пустить по ценам лавки мимо ратуши.
 */
export async function shopTown(mapId: string, q: number, r: number): Promise<TownKey | null> {
  const rows = (await mcpExec(
    `SELECT s.town_q AS tq, s.town_r AS tr
       FROM yuplink.raid_market_shop s
       JOIN yuplink.raid_town t ON t.map_id = s.map_id AND t.q = s.town_q AND t.r = s.town_r
      WHERE s.map_id = ${sqlStr(mapId)} AND s.q = ${Math.trunc(q)} AND s.r = ${Math.trunc(r)}
      LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ tq: number; tr: number }>;
  const row = rows?.[0];
  return row ? { mapId, q: Number(row.tq), r: Number(row.tr) } : null;
}

/** Все ратуши карты от ближней к лавке до самой дальней. */
export async function townHallsNear(
  mapId: string,
  q: number,
  r: number,
): Promise<TownHallOption[]> {
  const rows = (await mcpExec(
    `SELECT t.q, t.r, t.config->>'residents' AS residents, t.config->>'name' AS title,
            COALESCE(b.name, 'Ратуша') AS name, land.name AS land
       FROM yuplink.raid_town t
       LEFT JOIN yuplink.raid_map_cells c ON c.map_id = t.map_id AND c.q = t.q AND c.r = t.r
       LEFT JOIN yuplink.mystic_item_template b ON b.id = c.building_id
       LEFT JOIN yuplink.mystic_item_template land ON land.id = c.terrain_id
      WHERE t.map_id = ${sqlStr(mapId)};`,
    { wrapJson: true },
  )) as Array<{
    q: number;
    r: number;
    residents: string | null;
    title: string | null;
    name: string;
    land: string | null;
  }>;
  return (rows ?? [])
    .map((x) => ({
      q: Number(x.q),
      r: Number(x.r),
      title: cleanTownName(x.title) || null,
      name: x.name,
      land: x.land ?? null,
      residents: Math.max(0, Math.round(Number(x.residents) || 0)),
      dist: hexDistance(q, r, Number(x.q), Number(x.r)),
    }))
    .sort((a, b) => a.dist - b.dist || a.q - b.q || a.r - b.r);
}

const cellInput = z.object({ q: z.number().int(), r: z.number().int() });

export const getShopTownBinding = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => cellInput.parse(d))
  .handler(async ({ data }): Promise<ShopTownBinding> => {
    const { mapId } = await requireGodAdmin();
    const [town, halls] = await Promise.all([
      shopTown(mapId, data.q, data.r),
      townHallsNear(mapId, data.q, data.r),
    ]);
    return { town: town ? { q: town.q, r: town.r } : null, halls };
  });

export const setShopTownBinding = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => cellInput.extend({ town: cellInput.nullable() }).parse(d))
  .handler(async ({ data }) => {
    const { mapId } = await requireGodAdmin();
    if (data.town) {
      // Привязать можно только к живой ратуше этой же карты: иначе лавка
      // числилась бы за городом, которого нет, и торговала бы как обычная.
      const hall = (await mcpExec(
        `SELECT 1 AS ok FROM yuplink.raid_town
          WHERE map_id = ${sqlStr(mapId)} AND q = ${data.town.q} AND r = ${data.town.r} LIMIT 1;`,
        { wrapJson: true },
      )) as Array<{ ok: number }>;
      if (!hall?.length) throw new Error("Такой ратуши на карте нет");
    }
    const tq = data.town ? String(data.town.q) : "NULL";
    const tr = data.town ? String(data.town.r) : "NULL";
    await mcpExec(
      `INSERT INTO yuplink.raid_market_shop (map_id, q, r, town_q, town_r, updated_at)
       VALUES (${sqlStr(mapId)}, ${data.q}, ${data.r}, ${tq}, ${tr}, now())
       ON CONFLICT (map_id, q, r) DO UPDATE SET
         town_q = EXCLUDED.town_q, town_r = EXCLUDED.town_r, updated_at = now();`,
      { wrapJson: false },
    );
    return { ok: true as const };
  });
