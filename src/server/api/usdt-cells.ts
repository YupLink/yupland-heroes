// Правки клеток карты против «Свободно USDT» (ПРАВИЛА §8.49а): сколько USDT обещали
// живые объекты ДО правки и сколько пообещают ПОСЛЕ. Рост — только в пределах
// свободного с запасом, иначе правка не пишется вовсе.
//
// Большие наборы (полное сохранение редактора, генератор миров) сначала сужаются
// до клеток, которые вообще могут нести USDT: своя награда с «usdt» в тексте или
// шаблон с USDT в награде. Обычно таких нет — и база не трогается.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { assertUsdtGrowth, usdtOfObjects } from "./usdt-objects";

export type CellPatch = {
  q: number;
  r: number;
  /** undefined — объект не трогаем; null — снять. */
  objectId?: string | null;
  /** Новая настройка объекта целиком (null — снять). */
  objectConfig?: unknown;
  /** Дописать к настройке (как jsonb `||`). */
  objectConfigMerge?: Record<string, unknown>;
  /** Смена объекта всегда сбрасывает настройку (точечная правка), а не только «другой». */
  resetConfig?: boolean;
  /** true — оживить, false — погасить. */
  alive?: boolean;
};

type Now = { q: number; r: number; object_id: string | null; object_config: unknown; dead: boolean };

const key = (q: number, r: number) => `${q},${r}`;

async function cellsNow(mapId: string, cells: Array<{ q: number; r: number }>): Promise<Now[]> {
  if (cells.length === 0) return [];
  const coords = cells.map((c) => `(${Number(c.q)}, ${Number(c.r)})`).join(", ");
  const rows = (await mcpExec(
    `SELECT c.q, c.r, c.object_id, c.object_config,
            (hp.killed_at IS NOT NULL) AS dead
       FROM yuplink.raid_map_cells c
       LEFT JOIN yuplink.beta_raid_object_hp hp
              ON hp.map_id = c.map_id AND hp.q = c.q AND hp.r = c.r AND hp.cycle_no = 0
      WHERE c.map_id = ${sqlStr(mapId)} AND (c.q, c.r) IN (${coords});`,
    { wrapJson: true },
  )) as Now[] | null;
  if (!Array.isArray(rows)) throw new Error("Клетки не прочитались — запись отложена");
  return rows;
}

/** Шаблоны (босса и предмета), в награде которых есть USDT. */
async function usdtTemplates(): Promise<Set<string>> {
  const rows = (await mcpExec(
    `SELECT 'boss:' || id AS id FROM yuplink.raid_boss_template WHERE reward_tiers::text ILIKE '%usdt%'
     UNION ALL
     SELECT id FROM yuplink.mystic_item_template WHERE meta::text ILIKE '%usdt%';`,
    { wrapJson: true },
  )) as Array<{ id: string }> | null;
  if (!Array.isArray(rows)) throw new Error("Шаблоны не прочитались — запись отложена");
  return new Set(rows.map((r) => r.id));
}

/** Может ли объект нести USDT — грубо, чтобы не гонять в базу тысячи пустых клеток. */
function mayHoldUsdt(objectId: string | null | undefined, cfg: unknown, tpl: Set<string>): boolean {
  if (!objectId) return false;
  if (cfg && /usdt/i.test(JSON.stringify(cfg))) return true;
  const bare = objectId.includes(":") ? objectId.split(":")[1] : objectId;
  return tpl.has(objectId) || tpl.has(bare);
}

/** Отказ, если правки поднимут обещанный USDT сверх свободного с запасом. */
export async function assertUsdtPatches(
  mapId: string,
  patches: CellPatch[],
  what: string,
): Promise<void> {
  if (patches.length === 0) return;
  const tpl = await usdtTemplates();
  const now = new Map((await cellsNow(mapId, patches)).map((c) => [key(c.q, c.r), c]));
  const before: Now[] = [];
  const after: Now[] = [];
  for (const p of patches) {
    const was = now.get(key(p.q, p.r)) ?? {
      q: p.q, r: p.r, object_id: null, object_config: null, dead: false,
    };
    const changed = p.objectId !== undefined && p.objectId !== was.object_id;
    const reset = p.objectId !== undefined && (changed || p.resetConfig === true);
    let cfg: unknown = p.objectConfig !== undefined ? p.objectConfig : reset ? null : was.object_config;
    if (p.objectConfigMerge) cfg = { ...((cfg as Record<string, unknown>) ?? {}), ...p.objectConfigMerge };
    const dead = p.alive !== undefined ? !p.alive : changed ? false : was.dead;
    const next = { ...was, object_id: p.objectId !== undefined ? p.objectId : was.object_id, object_config: cfg, dead };
    if (!was.dead && mayHoldUsdt(was.object_id, was.object_config, tpl)) before.push(was);
    if (!next.dead && mayHoldUsdt(next.object_id, next.object_config, tpl)) after.push(next);
  }
  if (before.length === 0 && after.length === 0) return;
  await assertUsdtGrowth(await usdtOfObjects(before), await usdtOfObjects(after), what);
}

/** Большой набор клеток (полное сохранение, генератор): в проверку — только возможные USDT. */
export async function assertUsdtCellSet(
  mapId: string,
  cells: Array<{ q: number; r: number; objectId?: string | null; objectConfig?: unknown }>,
  what: string,
): Promise<void> {
  const tpl = await usdtTemplates();
  const maybe = cells.filter((c) => mayHoldUsdt(c.objectId, c.objectConfig, tpl));
  await assertUsdtPatches(
    mapId,
    maybe.map((c) => ({ q: c.q, r: c.r, objectId: c.objectId ?? null, objectConfig: c.objectConfig ?? null })),
    what,
  );
}

/** То же для карты «q,r» → клетка (полное сохранение редактора). */
export async function assertUsdtCellMap(
  mapId: string,
  cells: Record<string, { objectId?: string | null; objectConfig?: unknown }>,
  what: string,
): Promise<void> {
  const list = Object.entries(cells).map(([k, v]) => {
    const [q, r] = k.split(",").map(Number);
    return { q, r, objectId: v.objectId ?? null, objectConfig: v.objectConfig };
  });
  await assertUsdtCellSet(mapId, list, what);
}
