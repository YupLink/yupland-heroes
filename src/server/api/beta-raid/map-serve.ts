// Отдача карты игроку: двоичный снимок целиком или дельта с его версии.
//
// Общее для двух маршрутов (/api/beta-raid/map-blob и /map-delta): кто
// просит, на какой он карте, какой ему вариант снимка (админ видит под
// куполом), и сама карта (id, имя, размер) из короткоживущего кэша — раньше
// строка raid_maps читалась на каждый запрос карты.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId } from "./encounter-where";
import { canIgnoreVoid } from "./voidGate";
import {
  getCellSetSnapshot,
  getMapSnapshot,
  currentRevision,
  type MapSnapshot,
} from "./map-snapshot";
import { readJournal, type JournalRead } from "./map-journal";
import { MAIN_MAP_SQL } from "./pos-map-sql";

/**
 * main — главный мир: замок стоит только в нём (этажи, 07.10.2026). Уходит в
 * шапку снимка, и клиент на других этажах замок не рисует.
 */
export type MapRow = { id: string; name: string; size: number; main: boolean };

const rows = new Map<string, { row: MapRow | null; at: number }>();
const ROW_TTL = 60_000;

export async function mapRow(mapId: string): Promise<MapRow | null> {
  const hit = rows.get(mapId);
  if (hit && Date.now() - hit.at < ROW_TTL) return hit.row;
  const got = (await mcpExec(
    `SELECT rm.id, rm.name, rm.size, COALESCE(rm.id = ${MAIN_MAP_SQL}, false) AS main
       FROM yuplink.raid_maps rm WHERE rm.id = ${sqlStr(mapId)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<MapRow>;
  const g = got?.[0];
  const row = g ? { id: g.id, name: g.name, size: Number(g.size), main: g.main === true } : null;
  rows.set(mapId, { row, at: Date.now() });
  return row;
}

/** Кто просит и что ему положено. */
export async function mapRequester(): Promise<{
  wallet: string;
  map: MapRow | null;
  admin: boolean;
}> {
  const wallet = await requireBetaRaid();
  const map = await mapRow(await myMapId(wallet));
  return { wallet, map, admin: canIgnoreVoid(wallet) };
}

/**
 * Снимок для запросившего. Ждём СВЕЖУЮ сборку, если версия ушла вперёд: после
 * «перестроить карту» все клиенты разом просят снимок, и прежний (пока идёт
 * сборка) отдал бы им старую версию — они тут же спросили бы журнал, получили
 * «бери снимок» и пошли бы по кругу, качая по 80 КБ на круг.
 */
export async function snapshotFor(map: MapRow, admin: boolean): Promise<MapSnapshot> {
  const { startDeadSweeper } = await import("./dead-sweep");
  startDeadSweeper(map.id);
  // Возврат срубленного декора (decor-respawn) — тем же поводом: процесс,
  // отдающий карту, разбирает и очередь возвратов, в том числе после рестарта.
  const { startDecorRespawner } = await import("./decor-respawn");
  startDecorRespawner();
  // Истёкшие мешочки (24 ч) — тем же поводом (loot-bag/bag-sweep.ts).
  const { startLootBagSweeper } = await import("./loot-bag/bag-sweep");
  startLootBagSweeper();
  // Точки возрождения мобов: встать, шагнуть (mob-spawn/mob-spawn.ts).
  const { startMobSpawner } = await import("./mob-spawn/mob-spawn");
  startMobSpawner();
  // Стейкинг банка: золото за сутки, выводы холдеров по сроку (bank/stake-ticker.ts).
  const { startBankStakeTicker } = await import("../bank/stake-ticker");
  startBankStakeTicker();
  // Сторож «Свободно USDT»: минус — сигнал админам (usdt-watch.ts).
  const { startUsdtWatch } = await import("../usdt-watch");
  startUsdtWatch();
  return getMapSnapshot(map, admin ? "admin" : "player", { wait: true });
}

/** Снимок для набора клеток (туман): готовый, без пересборки на каждую версию. */
export async function cellSetFor(map: MapRow, admin: boolean): Promise<MapSnapshot> {
  return getCellSetSnapshot(map, admin ? "admin" : "player");
}

/** Пауза между попытками прочитать журнал, пока запись версии догоняет её сдвиг. */
const JOURNAL_RETRY_MS = 150;
const JOURNAL_RETRIES = 4;

/**
 * Дельта с версии `from`: журнал или «бери снимок».
 *
 * Версия сдвигается ДО записи в журнал (recordMapChange): в это окно (десятки
 * миллисекунд, для правки кистью — до сборки словарей) журнал ещё не дошёл до
 * current, и ответ был бы «бери снимок» для всех, кто спросил в этот миг.
 * Даём записи догнать: несколько коротких повторов, потом честный ответ.
 */
export async function deltaFor(map: MapRow, from: number): Promise<JournalRead> {
  const current = await currentRevision(map.id);
  let read = await readJournal(map.id, from, current);
  for (let i = 0; i < JOURNAL_RETRIES && read.full && read.lagging; i++) {
    await new Promise((r) => setTimeout(r, JOURNAL_RETRY_MS));
    read = await readJournal(map.id, from, current);
  }
  return read;
}
