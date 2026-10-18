// Какую часть карты отдавать игроку.
//
// Карта общая и большая: почти двадцать пять тысяч клеток. Но средний игрок
// видел из них около трёх тысяч — остальное для него закрыто туманом, а ехало
// целиком и на первый же вход.
//
// Поэтому вход делится надвое: сначала «ядро» — разведанное плюс круг вокруг
// героя, этого хватает, чтобы сразу ходить; следом клиент фоном забирает
// остальное, и дальние маршруты снова работают.
//
// Админ получает карту целиком всегда: он её рисует, и куски ему только мешают.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { raidOwner } from "./owner";
import type { RawCell } from "./packCells";

/**
 * Радиус вокруг героя, который едет даже неразведанным.
 *
 * Соседние клетки нужны, чтобы шаг был возможен сразу после входа: кружки
 * ходов считает сервер, но рисует их карта. Двенадцать — это заметно дальше
 * экрана, чтобы прокрутка не упиралась в пустоту.
 */
const AROUND = 12;

/** Клетки, которые игрок уже открывал. Пусто — новичок, ему хватит круга. */
async function seenKeys(wallet: string, mapId: string): Promise<Set<string>> {
  const owner = await raidOwner(wallet);
  const rows = (await mcpExec(
    `SELECT cell FROM yuplink.beta_raid_fog_seen
      WHERE owner = ${sqlStr(owner)} AND map_id = ${sqlStr(mapId)};`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ cell: string }>;
  return new Set((rows ?? []).map((r) => String(r.cell)));
}

/** Расстояние в гексах — то же правило, что и у шага. */
const dist = (aq: number, ar: number, bq: number, br: number): number =>
  (Math.abs(aq - bq) + Math.abs(aq + ar - bq - br) + Math.abs(ar - br)) / 2;

/**
 * Ядро карты: разведанное плюс круг вокруг героя.
 *
 * Возвращает сами клетки — словари и упаковка строятся уже по ним, поэтому
 * лишние имена и картинки в ответ тоже не попадают.
 */
export async function coreCells(opts: {
  wallet: string;
  mapId: string;
  cells: RawCell[];
  at: { q: number; r: number } | null;
}): Promise<RawCell[]> {
  const seen = await seenKeys(opts.wallet, opts.mapId);
  const at = opts.at;
  return opts.cells.filter((c) => {
    const q = Number(c.q);
    const r = Number(c.r);
    if (seen.has(`${q},${r}`)) return true;
    return !!at && dist(q, r, at.q, at.r) <= AROUND;
  });
}

/**
 * Регион вокруг камеры: клетки в hex-радиусе `radius` от центра (cq,cr).
 * В отличие от coreCells не привязан к разведанному — это ровно то, что
 * попадает в видимую область (плюс буфер), сколько бы игрок ни исходил.
 * Так карта грузится кусками по камере, а не вся (53k) разом.
 */
export function regionCells(opts: {
  cells: RawCell[];
  center: { q: number; r: number };
  radius: number;
}): RawCell[] {
  const { center, radius } = opts;
  return opts.cells.filter((c) => dist(Number(c.q), Number(c.r), center.q, center.r) <= radius);
}
