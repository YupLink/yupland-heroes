// Где стоит игрок и какая карта активна — общее для энкаунтера и осмотра.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { swrCache } from "../../cache/swr";
import { raidOwner } from "./owner";
import { hexDistance } from "./helpers";

/** Клетка на карте рейда. */
export type Cell = { q: number; r: number };

/**
 * Активную карту переключает админ раз в месяц, а спрашивает её КАЖДЫЙ запрос
 * рейда — шаг, причалы, игроки, туман, бой. Полминуты кэша убирают из каждого
 * из них по сетевому рейсу; переключил админ карту — сбрасывает сам
 * (map.adminSetBetaRaidMap), так что ждать протухания не приходится.
 */
const MAP_TTL_MS = 45_000;
/** Обновляется фоном: ход, выпавший на границу срока, за это не платит. */
const mapCache = swrCache<string>({ ttl: MAP_TTL_MS, load: fetchActiveMapId });
const MAP_KEY = "active";

/** Админ выбрал другую карту — прежний снимок не годится. */
export function dropActiveMapCache(): void {
  // Здесь именно выбросить: игрок не должен ни одного хода сделать по старой
  // карте. Прогрев следом — чтобы ждать пришлось не ему, а этой строке.
  mapCache.drop();
  mapCache.warm(MAP_KEY);
}

/** id карты, назначенной админом (settings.beta_raid_map). */
export async function activeBetaMapId(): Promise<string> {
  return mapCache.get(MAP_KEY);
}

/**
 * Карта, на которой игрок СЕЙЧАС (фундамент мультикарты «точка-в-точку»). Берём
 * из его позиции (миграция проставила map_id всем строкам); строки ещё нет или
 * поле пустое — активная карта. Пока жива одна карта, для всех = активная.
 */
export async function playerMapId(account: string): Promise<string> {
  const rows = (await mcpExec(
    `SELECT map_id FROM yuplink.beta_raid_positions WHERE account_id = ${sqlStr(account)} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ map_id: string | null }>;
  return rows?.[0]?.map_id ?? (await activeBetaMapId());
}

/** Карта игрока по КОШЕЛЬКУ (резолвит аккаунт). Для игровых ручек — вместо
 *  глобальной activeBetaMapId. Пока все на активной карте — вернёт её же. */
export async function myMapId(wallet: string): Promise<string> {
  const { raidOwner } = await import("./owner");
  return playerMapId(await raidOwner(wallet));
}

async function fetchActiveMapId(): Promise<string> {
  const rows = (await mcpExec(`SELECT value FROM yuplink.settings WHERE key = 'beta_raid_map';`, {
    wrapJson: true,
  })) as Array<{ value: string }>;
  let mapId: string | null = null;
  try {
    mapId = (JSON.parse(rows?.[0]?.value ?? "{}") as { mapId?: string }).mapId ?? null;
  } catch {
    mapId = null;
  }
  if (!mapId) throw new Error("Карта бета-рейда не установлена");
  return mapId;
}

/**
 * Позиция СВОЕГО кошелька куском — чтобы вкладывать в запрос побольше и не
 * заводить второй копии правила (на копиях уже погорели: три запроса с разной
 * сортировкой показывали игроку три разные клетки).
 *
 * Сестринской подмены здесь больше нет. Раньше при ОТСУТСТВИИ своей строки
 * запрос отдавал строку сестры, и кошелёк, впервые вышедший на карту,
 * наследовал чужую клетку: первым же шагом он уводил сестринский корабль и
 * ходил от её позиции. Своей строки нет — значит игрока на карте нет, и
 * вызывающий ставит его на старт (замок), как и рисует клиент.
 *
 * `wallet` — первичный ключ таблицы, поэтому строка всегда одна и сортировка не
 * нужна. Точку с запятой не ставит намеренно.
 */
export function ownCellSql(account: string): string {
  return `SELECT q, r FROM yuplink.beta_raid_positions
      WHERE account_id = ${sqlStr(account)} LIMIT 1`;
}

/**
 * Клетка игрока. Одна на аккаунт, каким бы адресом он ни вошёл.
 *
 * Раньше строка была на каждый кошелёк, и подключение второго давало вторую
 * фигурку в другом месте карты: на телефоне и компьютере герой оказывался в
 * разных клетках. Теперь ключ — аккаунт, и второй строки взяться неоткуда.
 *
 * null = игрока на карте нет; это не ошибка, вызывающий решает сам.
 */
export async function ownCell(wallet: string): Promise<Cell | null> {
  const account = await raidOwner(wallet);
  const rows = (await mcpExec(`${ownCellSql(account)};`, { wrapJson: true })) as Array<Cell>;
  const pos = rows?.[0];
  return pos ? { q: Number(pos.q), r: Number(pos.r) } : null;
}

/** То же, но «не на карте» — ошибка: бой и осмотр объектов без клетки бессмысленны. */
export async function playerCell(wallet: string): Promise<Cell> {
  const pos = await ownCell(wallet);
  if (!pos) throw new Error("Ты ещё не на карте");
  return pos;
}

/** Взаимодействовать можно только с соседней клеткой. */
export function requireAdjacent(pos: Cell, q: number, r: number): void {
  if (hexDistance(pos.q, pos.r, q, r) > 1) {
    throw new Error("Подойди ближе к объекту");
  }
}
