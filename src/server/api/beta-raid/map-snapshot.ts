// Снимок карты: один готовый двоичный буфер на версию, а не сборка на запрос.
//
// Версия — raid_maps.revision. Любая правка карты (кисть, раздача, убитый
// объект, побег, тир постройки) идёт через map-journal.recordMapChange: там
// версия растёт, изменение пишется в журнал и уходит всем открытым картам
// дельтой. Снимок здесь пересобирается только когда версия ушла вперёд, и
// отдаётся всем как есть — 2 мс процессора на ответ вместо 600.
//
// Пока идёт пересборка, отдаём прежний буфер с прежней версией: клиент,
// получив его, сам дозапросит журнал с этой версии — так устаревший снимок
// ничего не ломает, а очередь запросов не ждёт сборку.
//
// Кэш по процессам: каждый держит свой буфер, но правда одна — номер версии
// в базе. Сброс приходит событием «map» через живой канал (и NOTIFY между
// процессами), а раз в секунду версия сверяется с базой на всякий случай.
import { gzipSync } from "node:zlib";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { subscribeRaid } from "../../raidLive";
import { purgeMapBase } from "./map-base";
import { traced } from "../../perf/trace";
import { assembleMap, type MapVariant } from "./map-assemble";
import { encodeMapBlob, MAP_BLOB_FORMAT } from "@/lib/raid/mapCodec";
import { cellOrderHash } from "@/lib/raid/cellOrder";

export type MapSnapshot = {
  mapId: string;
  variant: MapVariant;
  revision: number;
  /** Сырой буфер и он же в gzip — сжимаем один раз на версию. */
  raw: Uint8Array;
  gz: Uint8Array;
  builtAt: number;
  /** Координаты клеток в порядке снимка и подпись этого порядка (cellOrder). */
  q: Int16Array;
  r: Int16Array;
  order: string;
};

const REV_CHECK_MS = 1000;

const snapshots = new Map<string, MapSnapshot>();
const building = new Map<string, { rev: number; job: Promise<MapSnapshot> }>();
/** Версия из базы и когда её видели: сверка не чаще раза в секунду. */
const revSeen = new Map<string, { rev: number; at: number }>();

const key = (mapId: string, variant: MapVariant) => `${mapId}:${variant}`;

/** Пометить: версия карты могла уйти вперёд — следующий запрос сверится с базой. */
export function dropMapSnapshot(mapId?: string): void {
  if (mapId) revSeen.delete(mapId);
  else revSeen.clear();
}

/** Карты больше нет (снесённый остров) — снимки и сверки из памяти процесса. */
export function forgetMapSnapshot(mapId: string): void {
  for (const variant of ["player", "admin"] as const) {
    snapshots.delete(key(mapId, variant));
    building.delete(key(mapId, variant));
  }
  revSeen.delete(mapId);
  purgeMapBase(mapId);
}

// Событие «map» — наше же или с соседнего процесса через NOTIFY.
subscribeRaid((e) => {
  if (e.type !== "map") return;
  // Правка прошла на ДРУГОМ процессе: у нас устарели и снимок, и основа
  // (кэш клеток на 15 с) — иначе собрали бы старые клетки под новой версией.
  purgeMapBase(e.mapId);
  dropMapSnapshot(e.mapId);
  dropCellSetIfGrew(e);
});

/**
 * Появились клетки, которых нет в снимке (земля мира строителей, кисть по
 * пустоте), — снимок «какие клетки есть» устарел: туман отбросил бы новые
 * клетки как несуществующие (getCellSetSnapshot держит снимок до 10 минут).
 * Без списка клеток (большое событие) — тоже сбрасываем: не знаем, что там.
 */
function dropCellSetIfGrew(e: { mapId: string; full?: boolean; patches?: unknown }): void {
  const patches = Array.isArray(e.patches)
    ? (e.patches as Array<{ q: number; r: number; terrainId?: string | null }>)
    : null;
  if (patches && !patches.some((p) => p.terrainId)) return;
  for (const variant of ["player", "admin"] as const) {
    const snap = snapshots.get(key(e.mapId, variant));
    if (!snap) continue;
    const known = (p: { q: number; r: number }) => {
      for (let i = 0; i < snap.q.length; i++)
        if (snap.q[i] === p.q && snap.r[i] === p.r) return true;
      return false;
    };
    if (!patches || patches.some((p) => p.terrainId && !known(p)))
      snapshots.delete(key(e.mapId, variant));
  }
}

export async function currentRevision(mapId: string): Promise<number> {
  const hit = revSeen.get(mapId);
  if (hit && Date.now() - hit.at < REV_CHECK_MS) return hit.rev;
  const rows = (await mcpExec(
    `SELECT COALESCE(revision, 0) AS revision FROM yuplink.raid_maps WHERE id = ${sqlStr(mapId)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ revision: number | string }>;
  const rev = Number(rows?.[0]?.revision ?? 0) || 0;
  revSeen.set(mapId, { rev, at: Date.now() });
  return rev;
}

async function build(
  map: { id: string; name: string; size: number },
  variant: MapVariant,
  revision: number,
): Promise<MapSnapshot> {
  const data = await assembleMap(map, variant, revision);
  const p = data.packed;
  const raw = encodeMapBlob(
    {
      format: MAP_BLOB_FORMAT,
      n: p.q.length,
      revision,
      variant,
      map: data.map,
      dicts: {
        terrainIds: p.terrainIds,
        roadIds: p.roadIds,
        objectIds: p.objectIds,
        decorationIds: p.decorationIds,
        buildingIds: p.buildingIds,
        groupIds: p.groupIds,
      },
      lists: {
        defeated: p.defeated,
        runners: p.runners,
        voidFog: p.voidFog,
        townHalls: p.townHalls,
        mines: p.mines,
        ...(p.veins ? { veins: p.veins } : {}),
        groups: p.groups,
      },
      terrains: data.terrains,
      objects: data.objects,
      decorations: data.decorations,
      roads: data.roads,
      buildings: data.buildings,
      buildingTiers: data.buildingTiers,
      doors: data.doors,
    },
    p,
  );
  const gz = new Uint8Array(gzipSync(raw, { level: 6 }));
  const q = Int16Array.from(p.q);
  const r = Int16Array.from(p.r);
  const order = cellOrderHash(q, r, q.length);
  return { mapId: map.id, variant, revision, raw, gz, builtAt: Date.now(), q, r, order };
}

/**
 * Снимок нужной версии. Если версия в базе ушла вперёд — пересборка одна на
 * всех ждущих; пока она идёт, есть прежний снимок — отдаём его.
 */
export async function getMapSnapshot(
  map: { id: string; name: string; size: number },
  variant: MapVariant,
  /** wait — дождаться свежей сборки, а не отдать прежний снимок (дельта админа). */
  opts?: { wait?: boolean },
): Promise<MapSnapshot> {
  const k = key(map.id, variant);
  const rev = await currentRevision(map.id);
  const have = snapshots.get(k);
  if (have && have.revision >= rev) return have;
  let cur = building.get(k);
  if (!cur || cur.rev < rev) {
    // Сборка под более раннюю версию уже идёт — новая встаёт следом, чтобы не
    // читать базу дважды одновременно и не перепутать порядок версий.
    const after = cur ? cur.job.catch(() => undefined) : Promise.resolve(undefined);
    const job = after
      .then(() => traced("карта: снимок", () => build(map, variant, rev), variant))
      .then((snap) => {
        snapshots.set(k, snap);
        return snap;
      })
      .finally(() => {
        if (building.get(k)?.job === job) building.delete(k);
      });
    cur = { rev, job };
    building.set(k, cur);
  }
  if (have && !opts?.wait) return have;
  return cur.job;
}

/** Сколько снимок годится для вопроса «какие клетки есть на карте». */
const CELLSET_TTL_MS = 10 * 60_000;

/**
 * Снимок для набора клеток (туман: какие клетки есть, порядок для битов).
 * Набор меняется только правкой карты, а версия — от каждого боя, поэтому
 * свежий снимок тут не нужен: берём готовый и пересборку НЕ запускаем, пока
 * он моложе 10 минут. Раньше каждый запрос тумана с новой версией ждал полной
 * пересборки (сборка + кодирование + gzip ~1,3 МБ, 100–500 мс): 35 сборок за
 * 4 минуты при трёх скачиваниях карты (замер 11.10.2026).
 */
export async function getCellSetSnapshot(
  map: { id: string; name: string; size: number },
  variant: MapVariant,
): Promise<MapSnapshot> {
  const have = snapshots.get(key(map.id, variant));
  if (have && Date.now() - have.builtAt < CELLSET_TTL_MS) return have;
  return getMapSnapshot(map, variant);
}

/** Для отчёта о скорости. */
export function snapshotStats(): Array<{
  key: string;
  revision: number;
  bytes: number;
  gz: number;
  age: number;
}> {
  return [...snapshots.values()].map((s) => ({
    key: key(s.mapId, s.variant),
    revision: s.revision,
    bytes: s.raw.byteLength,
    gz: s.gz.byteLength,
    age: Date.now() - s.builtAt,
  }));
}
