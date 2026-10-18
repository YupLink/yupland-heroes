// Замок бета-рейда: где он стоит и рядом ли игрок.
//
// Замок — единственное место, где переодевают героя, меняют его самого и
// пересобирают отряд. Смысл в том, чтобы состав закреплялся дома, а не
// подгонялся под каждого встречного босса прямо перед ударом.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { activeBetaMapId, myMapId, ownCell, type Cell } from "./encounter-where";
import { getCastlePosition, hexDistance } from "./helpers";
import { isIslandMapId } from "@/lib/raid/island/ids";

/**
 * Насколько близко надо подойти. Ровно на клетку замка встать нельзя, если
 * там стоит постройка, поэтому «в замке» = вплотную к нему.
 */
const CASTLE_RADIUS = 1;

/** Размер карты не меняется, а спрашивают его на каждый опрос состояния. */
const sizeCache = new Map<string, number>();

export async function mapSizeOf(mapId: string): Promise<number> {
  const cached = sizeCache.get(mapId);
  if (cached) return cached;
  const rows = (await mcpExec(
    `SELECT size FROM yuplink.raid_maps WHERE id = ${sqlStr(mapId)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ size: number }>;
  const size = Number(rows?.[0]?.size);
  if (!size) throw new Error("Карта не найдена");
  sizeCache.set(mapId, size);
  return size;
}

/**
 * Замок главного мира — ратуша Юпленда (владелец, 10.10.2026: центральный
 * замок убран, все его дела — у ратуши). Клетка — в settings
 * 'beta_raid_castle' = {"q":34,"r":63}; нет настройки — центр карты, как было.
 * Кэш минута: замок двигают раз в жизни, а спрашивают на каждый шаг.
 */
const CASTLE_KEY = "beta_raid_castle";
const CASTLE_TTL_MS = 60_000;
let castleHit: { at: number; cell: Cell | null } | null = null;

async function castleSetting(): Promise<Cell | null> {
  if (castleHit && Date.now() - castleHit.at < CASTLE_TTL_MS) return castleHit.cell;
  const rows = (await mcpExec(
    `SELECT value FROM yuplink.settings WHERE key = ${sqlStr(CASTLE_KEY)} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ value: unknown }>;
  let cell: Cell | null = null;
  try {
    const raw = rows?.[0]?.value;
    const v = (typeof raw === "string" ? JSON.parse(raw) : raw) as { q?: unknown; r?: unknown };
    const q = Number(v?.q);
    const r = Number(v?.r);
    if (Number.isFinite(q) && Number.isFinite(r)) cell = { q: Math.trunc(q), r: Math.trunc(r) };
  } catch {
    cell = null;
  }
  castleHit = { at: Date.now(), cell };
  return cell;
}

/**
 * Клетка замка: в главном мире — из настройки (ратуша Юпленда), на этажах и
 * без настройки — центр карты.
 *
 * mapId передаёт тот, у кого он уже на руках (шаг, состояние рейда): свой
 * activeBetaMapId был бы третьим чтением одной и той же настройки за ответ.
 */
export async function castleCell(mapId?: string): Promise<Cell> {
  const main = await activeBetaMapId();
  const id = mapId ?? main;
  if (id === main) {
    const set = await castleSetting();
    if (set) return set;
  }
  return getCastlePosition(await mapSizeOf(id));
}

/**
 * Та же проверка, но по уже прочитанной клетке — чистая функция без запросов.
 * Нужна тем, кто позицию уже держит в руках (состояние рейда опрашивают часто,
 * и второй SELECT ради того же ответа там лишний). null = не на карте.
 */
export function cellAtCastle(pos: Cell | null, castle: Cell): boolean {
  return !!pos && hexDistance(pos.q, pos.r, castle.q, castle.r) <= CASTLE_RADIUS;
}

/**
 * Стоит ли игрок в замке (на клетке или вплотную).
 *
 * Спрашиваем ownCell, а не позицию аккаунта: иначе достаточно припарковать у
 * замка одну сестру, чтобы замок открылся из любой другой сессии.
 */
export async function isAtCastle(wallet: string): Promise<boolean> {
  // Игрока может не быть на карте вовсе — это не ошибка, просто «не в замке».
  const pos = await ownCell(wallet).catch(() => null);
  if (!pos) return false;
  // Замок стоит в главном мире: на другом этаже те же координаты — чужая
  // земля, а не порог замка.
  const [mine, main] = await Promise.all([myMapId(wallet), activeBetaMapId()]);
  if (mine !== main) {
    // Свой остров новичка: замок — у его ратуши (§8.47), остальные этажи — нет.
    if (!isIslandMapId(mine)) return false;
    const { islandTownHere } = await import("./home-castle-core");
    return (await islandTownHere(mine, pos)) !== null;
  }
  if (cellAtCastle(pos, await castleCell(main))) return true;
  // Любая ратуша — тоже замок, не только своя основная (владелец, 16.10.2026: «в не
  // моём замке не смог заменить героя, а должен»). Войти пускают у любой — и дела
  // внутри (смена героя, отряд) работают там же.
  const { placeHere } = await import("./home-castle-core");
  return (await placeHere(main, pos)) !== null;
}

/** То же самое, но с понятным отказом. */
export async function requireAtCastle(wallet: string): Promise<void> {
  if (!(await isAtCastle(wallet))) {
    throw new Error("Это делается в замке — дойди до замка");
  }
}
