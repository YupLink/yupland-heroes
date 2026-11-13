// Межмировые порталы: какие входы карты ведут в другой мир и в какой.
//
// Сеть читается целиком одним запросом (на 29.10.2026 — две сотни порталов на
// пяти этажах) и раскладывается в памяти тем же правилом, что у прохода
// (portal-classify → portal-exits). Закрытый этаж назначения — портал никуда
// не ведёт, его нет и в списке. Дверь (сеть 0) — шлагбаум на месте.
//
// Остров новичка — не этаж (карта закрыта для сети), его портал ведёт в
// основной мир (island-exit): туда, откуда пришёл админ на тесте, иначе в мир.
//
// Кэш SWR на полминуты, как у меток карты мира: это подсказка для глаз,
// проход проверяет сеть живьём.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { swrCache } from "@/server/cache/swr";
import { isDoor, portalConfig } from "@/lib/portal";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { ROOM_MAP_SQL } from "./portal-exits";
import { isVoidFlag } from "./packCells";
import { classifyPortals, type PortalRow } from "./portal-classify";

export type NetRow = PortalRow & {
  void_fog?: unknown;
  /** Клетки блока режима бога «q,r;…» по (r ↑, q ↑); не блок — null. */
  block?: string | null;
};

/**
 * Межмировой вход: карты назначения id-шниками (имена — снаружи). cells —
 * клетки постройки: у блока режима бога все его клетки (r ↑, q ↑), иначе одна.
 */
export type CrossPortal = {
  q: number;
  r: number;
  cells: Array<[number, number]>;
  to: string[];
  alsoHere: boolean;
  void: boolean;
};

// Признак портала — как в portal-exits (и cellBuildingEffect): эффект клетки
// главнее шаблона, имя смотрим, только когда эффекта нет вовсе.
export const PORTAL_SQL = `c.building_id IS NOT NULL AND (
     c.building_config->>'effect' = 'portal'
     OR ((c.building_config->>'effect') IS NULL
         AND (t.meta->>'effect' = 'portal' OR t.name ~* '(портал|телепорт|врат|portal)')))`;

// Постройка блока стоит на одной клетке, а живая карта рисует её, когда
// разведана ЛЮБАЯ клетка блока (drawMergedBlocks) — список клеток едет с входом.
const COLS = `c.map_id, c.q, c.r, c.building_config->'portal' AS portal,
       c.building_config->'portal'->>'group' AS grp, ${ROOM_MAP_SQL("c")} AS room_map, c.void_fog,
       CASE WHEN c.group_id IS NULL THEN NULL ELSE (
         SELECT string_agg(b.q || ',' || b.r, ';' ORDER BY b.r, b.q)
           FROM yuplink.raid_map_cells b
          WHERE b.map_id = c.map_id AND b.group_id = c.group_id) END AS block`;

/** Клетки постройки входа: блок целиком (с самим входом) или одна клетка. */
export function blockCells(row: Pick<NetRow, "q" | "r" | "block">): Array<[number, number]> {
  const q = Number(row.q);
  const r = Number(row.r);
  const cells: Array<[number, number]> = [];
  for (const part of String(row.block ?? "").split(";")) {
    const m = /^(-?\d+),(-?\d+)$/.exec(part.trim());
    if (m) cells.push([Number(m[1]), Number(m[2])]);
  }
  if (!cells.some(([cq, cr]) => cq === q && cr === r)) cells.push([q, r]);
  return cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/**
 * Межмировые входы по картам. rows — порталы ОТКРЫТЫХ этажей (других выходов
 * у сети не бывает), live — id открытых карт.
 */
export function crossWorldPortals(
  rows: readonly NetRow[],
  live: ReadonlySet<string>,
): Map<string, CrossPortal[]> {
  const verdicts = classifyPortals(rows, live);
  const out = new Map<string, CrossPortal[]>();
  rows.forEach((e, i) => {
    const v = verdicts[i];
    if (v.kind !== "cross") return;
    const list = out.get(e.map_id) ?? [];
    list.push({
      q: Number(e.q),
      r: Number(e.r),
      cells: blockCells(e),
      to: v.to,
      alsoHere: v.alsoHere,
      void: isVoidFlag(e.void_fog),
    });
    out.set(e.map_id, list);
  });
  return out;
}

type Net = { byMap: Map<string, CrossPortal[]>; names: Map<string, string> };

/** Порталы открытых этажей и имена миров по номеру этажа — свежие, без кэша (сверка порталов). */
export async function loadPortalNet(): Promise<{ rows: NetRow[]; names: Map<string, string> }> {
  const [rows, maps] = await Promise.all([
    mcpExec(
      `SELECT ${COLS}
         FROM yuplink.raid_map_cells c
         JOIN yuplink.raid_maps m ON m.id = c.map_id AND m.active
         JOIN yuplink.mystic_item_template t ON t.id = c.building_id
        WHERE ${PORTAL_SQL};`,
      { wrapJson: true },
    ) as Promise<NetRow[]>,
    // Имя мира — название этажа («Мир Альфа»); карта без этажа — своё имя.
    mcpExec(
      `SELECT m.id, COALESCE(f.name, m.name) AS name
         FROM yuplink.raid_maps m LEFT JOIN yuplink.raid_floor f ON f.map_id = m.id
        WHERE m.active ORDER BY f.num NULLS LAST, m.id;`,
      { wrapJson: true },
    ) as Promise<Array<{ id: string; name: string | null }>>,
  ]);
  const names = new Map((maps ?? []).map((m) => [String(m.id), String(m.name ?? m.id)]));
  return { rows: rows ?? [], names };
}

async function loadNet(): Promise<Net> {
  const { rows, names } = await loadPortalNet();
  return { byMap: crossWorldPortals(rows, new Set(names.keys())), names };
}

const cache = swrCache<Net>({ ttl: 30_000, load: loadNet });

/** Название мира для подписи. Нет в списке открытых — пусто (не гадаем). */
async function worldName(mapId: string, net: Net): Promise<string | null> {
  const known = net.names.get(mapId);
  if (known) return known;
  const rows = (await mcpExec(
    `SELECT COALESCE(f.name, m.name) AS name
       FROM yuplink.raid_maps m LEFT JOIN yuplink.raid_floor f ON f.map_id = m.id
      WHERE m.id = ${sqlStr(mapId)} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ name: string | null }>;
  return rows?.[0]?.name ?? null;
}

/** Порталы своего острова: любой не-дверь ведёт в основной мир. */
async function islandPortals(account: string, mapId: string, net: Net) {
  const { loadIsland } = await import("./island/island-row");
  const row = await loadIsland(account);
  if (!row || row.mapId !== mapId) return [];
  const { activeBetaMapId } = await import("./encounter-where");
  const dest = row.back?.mapId ?? (await activeBetaMapId());
  const rows = (await mcpExec(
    `SELECT ${COLS}
       FROM yuplink.raid_map_cells c
       JOIN yuplink.mystic_item_template t ON t.id = c.building_id
      WHERE c.map_id = ${sqlStr(mapId)} AND ${PORTAL_SQL};`,
    { wrapJson: true },
  )) as NetRow[];
  return (rows ?? [])
    .filter((x) => !isDoor(portalConfig({ portal: x.portal })))
    .map((x) => ({
      q: Number(x.q),
      r: Number(x.r),
      cells: blockCells(x),
      to: [dest],
      alsoHere: false,
      void: isVoidFlag(x.void_fog),
    }));
}

/** Межмировые входы карты, где стоит игрок, с именами миров назначения. */
export async function crossPortalsOn(account: string, mapId: string) {
  const net = await cache.get("net");
  const list = isIslandMapId(mapId)
    ? await islandPortals(account, mapId, net)
    : (net.byMap.get(mapId) ?? []);
  const out: Array<CrossPortal & { names: string[] }> = [];
  for (const p of list) {
    const names = (await Promise.all(p.to.map((m) => worldName(m, net)))).filter(
      (n): n is string => !!n,
    );
    if (names.length) out.push({ ...p, names });
  }
  return out;
}
