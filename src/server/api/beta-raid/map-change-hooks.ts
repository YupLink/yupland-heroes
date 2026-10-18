// Как игровые события попадают в журнал карты: не «я думаю, клетка теперь
// такая», а «прочитай правду из базы и разошли её».
//
// Убитый объект, побег, уборка трупов, ревайв админом — все они меняют слой
// объектов клетки, и у каждого была своя версия того, что игрок должен
// увидеть. Здесь версия одна: состояние клетки после события читается из
// базы тем же правилом, каким карта собирается целиком (map-runners:
// сверху объект клетки, под ним беглец), и уходит дельтой всем. Значит, что
// в снимке, что в дельте, что после уборки — одна и та же клетка.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { RUNNER_LAYER } from "./runners";
import { objectKnownSql } from "./boss-snapshot";
import { recordMapChange } from "./map-journal";
import type { CellPatch } from "@/lib/raid/mapDelta";

type Key = { q: number; r: number };

const parse = (k: string): Key | null => {
  const [q, r] = k.split(",").map(Number);
  return Number.isFinite(q) && Number.isFinite(r) ? { q: Math.floor(q), r: Math.floor(r) } : null;
};

type TruthRow = {
  q: number;
  r: number;
  object_id: string | null;
  top_known: boolean | null;
  top_dead: boolean | null;
  runner_id: string | null;
  runner_dead: boolean | null;
};

/** Слой объектов клеток — как их сейчас видит база. */
export async function cellTruthPatches(mapId: string, keys: string[]): Promise<CellPatch[]> {
  const cells = keys.map(parse).filter((k): k is Key => !!k);
  if (cells.length === 0) return [];
  const m = sqlStr(mapId);
  const list = cells.map((c) => `(${c.q},${c.r})`).join(",");
  const rows = (await mcpExec(
    `SELECT c.q, c.r, c.object_id,
            (c.object_id IS NOT NULL AND ${objectKnownSql("c")}) AS top_known,
            EXISTS (SELECT 1 FROM yuplink.beta_raid_object_hp h
                     WHERE h.map_id = c.map_id AND h.q = c.q AND h.r = c.r AND h.cycle_no = 0
                       AND (h.killed_at IS NOT NULL OR h.current_hp <= 0)) AS top_dead,
            (SELECT rn.object_id FROM yuplink.beta_raid_runner rn
              WHERE rn.map_id = c.map_id AND rn.q = c.q AND rn.r = c.r AND ${objectKnownSql("rn")}
              LIMIT 1) AS runner_id,
            EXISTS (SELECT 1 FROM yuplink.beta_raid_object_hp h
                     WHERE h.map_id = c.map_id AND h.q = c.q AND h.r = c.r AND h.cycle_no = ${RUNNER_LAYER}
                       AND (h.killed_at IS NOT NULL OR h.current_hp <= 0)) AS runner_dead
       FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${m} AND (c.q, c.r) IN (${list});`,
    { wrapJson: true },
  )) as TruthRow[];
  const patches: CellPatch[] = [];
  for (const row of rows ?? []) {
    const q = Number(row.q);
    const r = Number(row.r);
    const top = row.top_known && row.object_id ? String(row.object_id) : null;
    const topAlive = !!top && !row.top_dead;
    // То же правило, что у overlayRunners: живой объект клетки сверху; нет
    // его — показан беглец; ни того, ни другого — пусто.
    if (topAlive) patches.push({ q, r, objectId: top, runner: false, alive: true });
    else if (row.runner_id)
      patches.push({
        q,
        r,
        objectId: String(row.runner_id),
        runner: true,
        alive: !row.runner_dead,
      });
    else if (top) patches.push({ q, r, objectId: top, runner: false, alive: false });
    else patches.push({ q, r, objectId: null, runner: false, alive: true });
  }
  return patches;
}

/**
 * Слой объектов на этих клетках изменился (бой, побег, уборка, ревайв):
 * прочитать правду и разослать. Ошибка не роняет действие — оно уже прошло.
 */
export async function noteCellsChanged(mapId: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    const patches = await cellTruthPatches(mapId, [...new Set(keys)]);
    if (patches.length > 0) await recordMapChange(mapId, { patches });
  } catch (e) {
    console.warn("[map-change] дельта не разослана:", (e as Error).message);
  }
}

/** Карту перестроили целиком (восстановление, раздача, расширение). */
export async function noteMapRebuilt(mapId: string): Promise<void> {
  try {
    await recordMapChange(mapId, { full: true }, undefined, { edit: true });
  } catch (e) {
    console.warn("[map-change] пересборка не разослана:", (e as Error).message);
  }
}

/**
 * Поменялся шаблон (имя, картинка, облик): он один на все карты, поэтому
 * пересобираем каждый открытый этаж, а не только главный мир.
 */
export async function noteLiveMapsRebuilt(): Promise<void> {
  const { liveMapIds } = await import("./floors");
  const ids = await liveMapIds().catch(() => [] as string[]);
  for (const id of ids) await noteMapRebuilt(id);
}

/**
 * Правка админа: кисть могла поставить объект, декор или постройку, которых
 * в словарях игроков ещё нет. Словари берём из свежесобранного снимка —
 * тем же кодом, что собирает карту целиком, ничего не переписывая.
 */
export async function noteAdminPatches(mapId: string, patches: CellPatch[]): Promise<void> {
  if (patches.length === 0) return;
  try {
    // Снятый купол: игроку уедет вся клетка, а не только признак (map-lifted).
    const { fillLifted } = await import("./map-lifted");
    patches = await fillLifted(mapId, patches);
    await recordMapChange(
      mapId,
      { patches },
      async () => {
        const { mapRow } = await import("./map-serve");
        const { getMapSnapshot } = await import("./map-snapshot");
        const { decodeMapBlob } = await import("@/lib/raid/mapCodec");
        const map = await mapRow(mapId);
        if (!map) return undefined;
        const snap = await getMapSnapshot(map, "admin", { wait: true });
        const decoded = decodeMapBlob(snap.raw);
        if (!decoded) return undefined;
        const h = decoded.header;
        const pick = (dict: Record<string, unknown>, ids: Array<string | null | undefined>) => {
          const out: Record<string, unknown> = {};
          for (const id of ids) if (id && dict[id]) out[id] = dict[id];
          return Object.keys(out).length ? out : undefined;
        };
        const skinKey = (id: string) => `skin:${id}`;
        return {
          terrains: pick(
            h.terrains,
            patches.map((p) => p.terrainId),
          ),
          roads: pick(
            h.roads,
            patches.map((p) => p.roadId),
          ),
          objects: pick(
            h.objects,
            patches.map((p) => p.objectId),
          ),
          decorations: pick(
            h.decorations,
            patches.map((p) => p.decorationId),
          ),
          buildings: pick(h.buildings, [
            ...patches.map((p) => p.buildingId),
            ...patches.map((p) => (p.buildingSkinId ? skinKey(p.buildingSkinId) : null)),
          ]),
        };
      },
      { edit: true },
    );
  } catch (e) {
    console.warn("[map-change] правка админа не разослана:", (e as Error).message);
  }
}
