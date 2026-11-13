// Туман войны — на сервере, по АККАУНТУ.
//
// Раньше разведанное лежало в localStorage браузера: игрок открывал карту с
// телефона, заходил с компьютера — и она снова была тёмной. Теперь память
// одна на аккаунт, устройства видят одно и то же.
//
// Разным игрокам карта по-прежнему открыта по-разному — это задумано.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { raidOwner } from "./owner";
import { withoutVoid } from "./voidCells";
import { canIgnoreVoid } from "./voidGate";
import { packBits } from "@/lib/raid/cellOrder";
import type { MapSnapshot } from "./map-snapshot";

const CELL = /^-?\d+,-?\d+$/;

/**
 * Открыть игроку клетки. Слияние на стороне БД: параллельные вкладки (и
 * разведка с вышки) не затирают работу друг друга.
 *
 * Клетки непроходимого тумана сюда не попадают вовсе — это единственный вход
 * записи (и шаг героя, и вышка), поэтому и отсекаем здесь: иначе «глухой»
 * гекс однажды осел бы в разведанном навсегда.
 *
 * Кроме админа: он по зоне ходит, и на экране она у него открыта. Фильтруй мы
 * и его — разведанное расходилось бы с показанным: прошёл зону, перезашёл, а
 * пройденное снова чёрное.
 */
export async function mergeFogCells(
  owner: string,
  mapId: string,
  cells: string[],
  bypassVoid = false,
): Promise<number> {
  const known = cells.filter((k) => CELL.test(k));
  const fresh = Array.from(new Set(bypassVoid ? known : await withoutVoid(mapId, known)));
  if (fresh.length === 0) return 0;
  // Разведанное — СТРОКИ (beta_raid_fog_seen), а не jsonb-массив в одной строке.
  // Прежний путь на КАЖДЫЙ шаг разворачивал и дедупил весь массив seen (у
  // активного игрока до 44k клеток) — O(N) на шаг, движение подвисало и тем
  // сильнее, чем больше исследовано. Здесь вставляем только НОВЫЕ клетки —
  // O(добавленных); повтор гасит ON CONFLICT.
  const values = fresh.map((c) => `(${sqlStr(owner)}, ${sqlStr(mapId)}, ${sqlStr(c)})`).join(", ");
  await mcpExec(
    `INSERT INTO yuplink.beta_raid_fog_seen (owner, map_id, cell)
     VALUES ${values}
     ON CONFLICT (owner, map_id, cell) DO NOTHING;`,
  );
  return fresh.length;
}

/**
 * Колонка «когда открыто»: по ней клиент забирает только новое (since), а не
 * весь список разведанного каждые 45 секунд (у лидера — 78 817 клеток,
 * 1,6 МБ). Добавляется один раз; у старых строк — время добавления колонки.
 */
let seenAtEnsured: Promise<void> | null = null;
function ensureSeenAt(): Promise<void> {
  if (!seenAtEnsured) {
    seenAtEnsured = mcpExec(
      `ALTER TABLE yuplink.beta_raid_fog_seen ADD COLUMN IF NOT EXISTS seen_at timestamptz DEFAULT now();`,
      { wrapJson: false },
    )
      .then(() => undefined)
      .catch((e) => {
        seenAtEnsured = null;
        throw e;
      });
  }
  return seenAtEnsured;
}

export const getBetaRaidFog = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        mapId: z.string().min(1),
        /** ISO-время прошлого ответа (`now`): вернуть только открытое после него. */
        since: z.string().max(40).optional(),
        /**
         * Подпись порядка клеток снимка у клиента (cellOrder). Совпала с
         * серверной — полный список едет битами по номерам клеток (~10 КБ
         * вместо ~560 КБ строк у разведавшего полкарты).
         */
        order: z.string().max(16).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const owner = await raidOwner(wallet);
    await ensureSeenAt().catch(() => {});
    // Запас в 10 с к since: вставка с другого устройства могла получить
    // seen_at раньше нашего now(), а закоммититься позже — без запаса она
    // выпала бы навсегда. Повтор клетки клиенту безвреден.
    const since = data.since && !Number.isNaN(Date.parse(data.since)) ? data.since : null;
    const rows = (await mcpExec(
      `SELECT cell, now() AS now FROM yuplink.beta_raid_fog_seen
        WHERE owner=${sqlStr(owner)} AND map_id=${sqlStr(data.mapId)}
          ${since ? `AND seen_at > ${sqlStr(since)}::timestamptz - interval '10 seconds'` : ""};`,
      { wrapJson: true },
    )) as Array<{ cell: string; now: string }>;
    let cells = (rows ?? []).map((r) => String(r.cell)).filter((k) => CELL.test(k));
    // Метка «до какого момента отдано»: клиент вернёт её как since. Пустой
    // ответ — берём серверное время отдельным запросом не будем: since остаётся.
    const now = rows?.[0]?.now ? String(rows[0].now) : null;
    // Сколько клеток сервер знает всего: устройство сверяет со своей памятью
    // и, недосчитавшись, перечитывает целиком. Память тумана лежит на
    // устройстве и дотягивает только «новое с прошлого раза» — стоило метке
    // since уехать вперёд без сохранённых битов, устройство отставало навсегда
    // («ПК и телефон не синхронизированы», 21.09). По PK — индексный подсчёт.
    const total = since ? await fogTotal(owner, data.mapId) : null;
    // Фильтруем и на чтении: клетка могла стать глухой уже ПОСЛЕ того, как
    // игрок её разведал. Админу отдаём как есть — ему зона видна по определению.
    const admin = canIgnoreVoid(wallet);
    if (!admin) cells = await withoutVoid(data.mapId, cells);
    if (!since && data.order && cells.length > 0) {
      const bits = await fogAsBits(data.mapId, admin, data.order, cells);
      if (bits) return { cells: [], bits, order: data.order, now, total: cells.length };
    }
    // Подсчёт не удался — total неизвестен (null), а не «ноль»: ноль устройство
    // читает как «сервер этаж забыл» и сбрасывает свою память (useFogSync).
    return { cells, now, total: since ? total : cells.length };
  });

/** Число разведанных клеток аккаунта на карте (для сверки с памятью устройства). */
async function fogTotal(owner: string, mapId: string): Promise<number | null> {
  const rows = (await mcpExec(
    `SELECT count(*)::int AS n FROM yuplink.beta_raid_fog_seen
      WHERE owner=${sqlStr(owner)} AND map_id=${sqlStr(mapId)};`,
    { wrapJson: true },
  ).catch(() => null)) as Array<{ n: number | string }> | null;
  const n = Number(rows?.[0]?.n);
  return Number.isFinite(n) ? n : null;
}

/**
 * Список клеток → биты по номерам клеток снимка, если порядок у клиента тот
 * же, что у текущего снимка сервера. Иначе null — поедут ключи.
 */
async function fogAsBits(
  mapId: string,
  admin: boolean,
  order: string,
  cells: string[],
): Promise<string | null> {
  const { mapRow, cellSetFor } = await import("./map-serve");
  const map = await mapRow(mapId);
  if (!map) return null;
  const snap = await cellSetFor(map, admin);
  if (snap.order !== order) return null;
  const at = snapshotIndex(snap);
  const n = snap.q.length;
  const bits = packBits(n, () => false);
  for (const k of cells) {
    const i = at.get(k);
    if (i !== undefined) bits[i >> 3] |= 1 << (i & 7);
  }
  return Buffer.from(bits).toString("base64");
}

/** «q,r» → номер клетки снимка; считается раз на снимок. */
const indexCache = new WeakMap<MapSnapshot, Map<string, number>>();
function snapshotIndex(snap: MapSnapshot): Map<string, number> {
  let at = indexCache.get(snap);
  if (!at) {
    at = new Map();
    for (let i = 0; i < snap.q.length; i++) at.set(`${snap.q[i]},${snap.r[i]}`, i);
    indexCache.set(snap, at);
  }
  return at;
}

export const addBetaRaidFog = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        mapId: z.string().min(1),
        // Шлём пачкой: за один поход игрок открывает десятки клеток.
        cells: z.array(z.string().max(24)).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const owner = await raidOwner(wallet);
    const admin = canIgnoreVoid(wallet);
    // Только клетки этой карты: разведанное другого этажа под её id (накладка
    // этажей, 07.10.2026) оседало бы туманом и открывало этаж, где не ходили.
    const onMap = await cellsOnMap(data.mapId, admin, data.cells);
    // Только рядом с тем, где герой был (fog-anchor.ts); админу — как раньше.
    const { fogAnchors, nearAnchors } = await import("./fog-anchor");
    const cells = admin ? onMap : nearAnchors(onMap, await fogAnchors(owner, data.mapId));
    const total = await mergeFogCells(owner, data.mapId, cells, admin);
    return { ok: true as const, total };
  });

/** Клетки, которые есть на карте (по снимку); карты нет — ничего. */
async function cellsOnMap(mapId: string, admin: boolean, cells: string[]): Promise<string[]> {
  const { mapRow, cellSetFor } = await import("./map-serve");
  const map = await mapRow(mapId).catch(() => null);
  if (!map) return [];
  const at = snapshotIndex(await cellSetFor(map, admin));
  return cells.filter((k) => at.has(k));
}
