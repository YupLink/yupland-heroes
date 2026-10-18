// Журнал изменений карты и единственный путь, которым карта меняется наружу.
//
// Раньше каждое место, менявшее клетку (кисть, раздача, бой, побег, тир
// постройки), само решало, как об этом узнают игроки — и в итоге все они
// говорили «перекачай карту целиком» (built/restored). Теперь любое изменение
// проходит здесь: версия карты +1, запись в журнал, дельта всем открытым
// картам по живому каналу, сброс снимка. Клиент применяет дельту к своим
// колонкам (0,005 мс на сотню клеток) и запоминает версию; вернувшийся с
// версией N получает из журнала только то, что было после N.
//
// Дельта — те же CellPatch, которыми клиент правит карту в кэше
// (components/beta-raid/patchMapCache): ничего нового клиенту учить не надо.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { publishRaid } from "../../raidLive";
import { purgeMapBase } from "./map-base";
import { dropMapSnapshot } from "./map-snapshot";
import type { CellPatch } from "@/lib/raid/mapDelta";
import type { MapDeltaAssets } from "@/lib/raid/mapDelta";

/** Больше этого клеток одним журналом не отдаём — дешевле полный снимок. */
export const JOURNAL_MAX_CELLS = 2000;
const KEEP_DAYS = 7;

let ensured: Promise<void> | null = null;
let lastCleanup = 0;

export function ensureJournalSchema(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await mcpExec(
        `CREATE TABLE IF NOT EXISTS yuplink.raid_map_journal (
           map_id text NOT NULL,
           revision bigint NOT NULL,
           at timestamptz NOT NULL DEFAULT now(),
           patch jsonb NOT NULL,
           PRIMARY KEY (map_id, revision)
         );`,
        { wrapJson: false },
      );
      await mcpExec(
        `CREATE INDEX IF NOT EXISTS raid_map_journal_at_idx ON yuplink.raid_map_journal (at);`,
        { wrapJson: false },
      );
      // Счётчик ПРАВОК (админ, редактор, пересборки) — отдельно от версии:
      // версия растёт и от боёв, а гекс-редактору важно только, не правил ли
      // карту кто-то ещё, пока он держал черновик.
      await mcpExec(
        `ALTER TABLE yuplink.raid_maps ADD COLUMN IF NOT EXISTS edit_seq bigint NOT NULL DEFAULT 0;`,
        { wrapJson: false },
      );
    })().catch((e) => {
      ensured = null;
      throw e;
    });
  }
  return ensured;
}

/** Версия +1 — и только так (правка админа — ещё и edit_seq). Возвращает новую версию. */
async function bumpRevision(mapId: string, edit: boolean): Promise<number> {
  await ensureJournalSchema();
  const rows = (await mcpExec(
    `UPDATE yuplink.raid_maps SET revision = COALESCE(revision, 0) + 1, updated_at = now()
      ${edit ? ", edit_seq = COALESCE(edit_seq, 0) + 1" : ""}
      WHERE id = ${sqlStr(mapId)} RETURNING revision`,
    { wrapJsonCte: true },
  )) as Array<{ revision: number | string }>;
  return Number(rows?.[0]?.revision ?? 0) || 0;
}

/** Сколько раз карту правили (не считая боёв) — гекс-редактор сверяет свой черновик с этим. */
export async function editSeq(mapId: string): Promise<number> {
  await ensureJournalSchema();
  const rows = (await mcpExec(
    `SELECT COALESCE(edit_seq, 0) AS edit_seq FROM yuplink.raid_maps WHERE id = ${sqlStr(mapId)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ edit_seq: number | string }> | null;
  return Number(rows?.[0]?.edit_seq ?? 0) || 0;
}

export type MapChange = { patches: CellPatch[]; assets?: MapDeltaAssets } | { full: true };

/**
 * Записать изменение карты и разослать его.
 *
 * `full` — карту перестроили целиком (восстановление, расширение, пересборка):
 * клиенты возьмут новый снимок. Ошибка журнала не должна ронять игровое
 * действие, которое уже прошло в базе, — глотаем, но версию и рассылку делаем.
 */
export async function recordMapChange(
  mapId: string,
  change: MapChange,
  /** Словари для новых id (кисть поставила объект, которого у клиентов нет). */
  assetsFor?: (rev: number) => Promise<MapDeltaAssets | undefined>,
  /** edit — правка админа/редактора/пересборка (двигает edit_seq), не игровое событие. */
  opts?: { edit?: boolean },
): Promise<number> {
  const rev = await bumpRevision(mapId, opts?.edit === true);
  // Снимок клеток должен перечитаться из базы ДО следующей сборки: stale-режим
  // тут не годится — сборка на старом снимке пометила бы старое новой версией.
  purgeMapBase(mapId);
  dropMapSnapshot(mapId);
  if ("patches" in change) {
    // Клетки под глухим туманом помечаем: канал и журнал отдадут их игрокам
    // пустыми (lib/raid/mapDelta.sanitizeDeltaForPlayer), админу — целиком.
    try {
      const { loadVoidCells } = await import("./voidCells");
      const dome = await loadVoidCells(mapId);
      if (dome.size > 0) {
        change = {
          ...change,
          patches: change.patches.map((p) =>
            p.voidFog !== false && dome.has(`${p.q},${p.r}`) ? { ...p, voidFog: true } : p,
          ),
        };
      }
    } catch {
      /* без снимка купола — как есть */
    }
    if (assetsFor) {
      try {
        const assets = await assetsFor(rev);
        if (assets) change = { ...change, assets };
      } catch (e) {
        console.warn("[map-journal] словари к дельте не собрались:", (e as Error).message);
      }
    }
  }
  try {
    await ensureJournalSchema();
    await mcpExec(
      `INSERT INTO yuplink.raid_map_journal (map_id, revision, patch)
       VALUES (${sqlStr(mapId)}, ${rev}, ${sqlStr(JSON.stringify(change))}::jsonb)
       ON CONFLICT (map_id, revision) DO NOTHING;`,
      { wrapJson: false },
    );
    if (Date.now() - lastCleanup > 60 * 60_000) {
      lastCleanup = Date.now();
      void mcpExec(
        `DELETE FROM yuplink.raid_map_journal WHERE at < now() - interval '${KEEP_DAYS} days';`,
        { wrapJson: false },
      ).catch(() => {});
    }
  } catch (e) {
    console.warn("[map-journal] запись не удалась:", (e as Error).message);
  }
  if ("full" in change) publishRaid({ type: "map", mapId, rev, full: true });
  else publishRaid({ type: "map", mapId, rev, patches: change.patches, assets: change.assets });
  return rev;
}

export type JournalRead =
  /** lagging — журнал ещё не дошёл до current (запись догоняет сдвиг версии): стоит переспросить. */
  | { full: true; rev: number; lagging?: boolean }
  | { full?: false; rev: number; patches: CellPatch[]; assets?: MapDeltaAssets };

/**
 * Что изменилось после версии `from`. Слишком много или была полная пересборка
 * — говорим «бери снимок». Правки одной клетки схлопываются: позже — главнее.
 */
export async function readJournal(
  mapId: string,
  from: number,
  current: number,
): Promise<JournalRead> {
  if (current === from) return { rev: current, patches: [] };
  // Версия в базе НИЖЕ клиентской (восстановили из бэкапа, пересоздали карту)
  // — клиент держит будущее, которого нет: снимок целиком.
  if (current < from) return { full: true, rev: current };
  await ensureJournalSchema();
  const rows = (await mcpExec(
    `SELECT revision, patch FROM yuplink.raid_map_journal
      WHERE map_id = ${sqlStr(mapId)} AND revision > ${Math.floor(from)}
      ORDER BY revision LIMIT ${JOURNAL_MAX_ROWS};`,
    { wrapJson: true },
  )) as Array<{ revision: number | string; patch: MapChange }>;
  return squashJournal(rows ?? [], from, current);
}

export const JOURNAL_MAX_ROWS = 500;

/** Чистая часть readJournal: свести строки журнала в одну дельту. */
export function squashJournal(
  rows: Array<{ revision: number | string; patch: MapChange }>,
  from: number,
  current: number,
): JournalRead {
  if (current === from) return { rev: current, patches: [] };
  // Версия в базе НИЖЕ клиентской (восстановили из бэкапа, пересоздали карту)
  // — клиент держит будущее, которого нет: снимок целиком.
  if (current < from) return { full: true, rev: current };
  // Дыра в журнале (чистка, старая версия без записей, версии не подряд) —
  // полный снимок: иначе клиент пропустил бы правки между from и первой строкой.
  if (rows.length === 0) return { full: true, rev: current, lagging: true };
  if (Number(rows[0].revision) !== from + 1) return { full: true, rev: current };
  const byCell = new Map<string, CellPatch>();
  const assets: MapDeltaAssets = {};
  let rev = from;
  for (const row of rows) {
    const change = row.patch;
    // Версии обязаны идти подряд и в середине: пропущенная строка (сбой
    // записи после сдвига версии) — правка, которой клиент не увидит.
    if (Number(row.revision) !== rev + 1) return { full: true, rev: current };
    rev = Number(row.revision);
    if ("full" in change) return { full: true, rev: current };
    for (const p of change.patches) {
      const k = `${p.q},${p.r}`;
      byCell.set(k, { ...(byCell.get(k) ?? { q: p.q, r: p.r }), ...p });
    }
    if (change.assets) mergeAssets(assets, change.assets);
    if (byCell.size > JOURNAL_MAX_CELLS) return { full: true, rev: current };
  }
  // До текущей версии не дошли (лимит строк или сдвиг версии без записи в
  // журнале) — снимок: отдать «ты на current» без её правок нельзя. Не по
  // лимиту строк — запись, скорее всего, догоняет: помечаем для повтора.
  if (rev < current) return { full: true, rev: current, lagging: rows.length < JOURNAL_MAX_ROWS };
  return { rev, patches: [...byCell.values()], assets };
}

function mergeAssets(into: MapDeltaAssets, from: MapDeltaAssets): void {
  for (const kind of ["terrains", "objects", "decorations", "roads", "buildings"] as const) {
    const src = from[kind];
    if (!src) continue;
    into[kind] = { ...(into[kind] ?? {}), ...src } as never;
  }
}
