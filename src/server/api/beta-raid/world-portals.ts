// Межмировые порталы для карт игрока (Ангелина, 29.10.2026): входы на карте,
// где стоит герой, и названия миров, куда они ведут.
//
// «Разведанное» — любому игроку рейда, без предмета «Карта»: обычная карта
// показывает межмировые порталы всем, но только там, где игрок сам побывал
// (туман войны, как у карты мира) и не под глухим туманом. Внутримировых
// порталов здесь нет вовсе — они остаются за покупной подробной картой
// (getWorldMap). «Вся карта» — по тем же правам, что у подробной: предмет у
// выбранного героя и админ (worldMapAccess).
//
// Выходы порталов в ответ не попадают ни в каком режиме: только клетка входа
// и имя мира назначения.
//
// Тяжёлые серверные модули — динамическим импортом: файл импортирует клиент.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isAdminWallet, isPayoutsAdminWallet } from "@/server/auth";
import { requireBetaRaid } from "./gate";
import { canOpenWorldMap, worldMapAccess } from "@/lib/raid/worldMapAccess";
import type { WorldPortalsWire } from "@/lib/raid/worldPortals";

export const getWorldPortals = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ mode: z.enum(["seen", "all"]).default("seen") }).parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<WorldPortalsWire> => {
    const wallet = await requireBetaRaid();
    const { raidOwner } = await import("./owner");
    const account = await raidOwner(wallet);
    if (data.mode === "all") {
      const { hasMapItem } = await import("./world-map-item");
      const access = worldMapAccess({
        owner: isPayoutsAdminWallet(wallet),
        admin: isAdminWallet(wallet),
        hasMapItem: await hasMapItem(account),
      });
      if (!canOpenWorldMap(access, "all")) throw new Error("wmap.no_access");
    }
    const { playerMapId } = await import("./encounter-where");
    const { crossPortalsOn } = await import("./world-portals-net");
    const mapId = await playerMapId(account);
    const list = await crossPortalsOn(account, mapId);
    const shown =
      data.mode === "all"
        ? list
        : await seenOnly(
            account,
            mapId,
            list.filter((p) => !p.void),
          );
    return {
      mapId,
      mode: data.mode,
      portals: shown.map((p) => ({ q: p.q, r: p.r, to: p.names, alsoHere: p.alsoHere })),
    };
  });

/**
 * Только входы, которые игрок видит на живой карте: разведана клетка постройки
 * или — у блока режима бога — любая его клетка (живая карта рисует блок на
 * последней разведанной, drawMergedBlocks). Клетка постройки не разведана —
 * отдаём ту разведанную клетку блока, где игрок видит картинку: неразведанную
 * координату не называем. Туман спрашиваем ровно про эти клетки.
 */
async function seenOnly<T extends { q: number; r: number; cells: Array<[number, number]> }>(
  account: string,
  mapId: string,
  list: T[],
): Promise<T[]> {
  const key = ([q, r]: [number, number]) => `${Math.round(q)},${Math.round(r)}`;
  const asked = [...new Set(list.flatMap((p) => p.cells.map(key)))];
  if (asked.length === 0) return [];
  const { mcpExec } = await import("@/server/db/mcpClient");
  const { sqlStr } = await import("@/server/api/raid-shared");
  const rows = (await mcpExec(
    `SELECT cell FROM yuplink.beta_raid_fog_seen
      WHERE owner = ${sqlStr(account)} AND map_id = ${sqlStr(mapId)}
        AND cell IN (${asked.map((c) => sqlStr(c)).join(", ")});`,
    { wrapJson: true },
  )) as Array<{ cell: string }>;
  const seen = new Set((rows ?? []).map((r) => String(r.cell)));
  const out: T[] = [];
  for (const p of list) {
    if (seen.has(key([p.q, p.r]))) {
      out.push(p);
      continue;
    }
    const at = p.cells.filter((c) => seen.has(key(c))).pop();
    if (at) out.push({ ...p, q: at[0], r: at[1] });
  }
  return out;
}
