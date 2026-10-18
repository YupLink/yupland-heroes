// Чем красит кисть режима бога и что сервер вернул неприменённым.
//
// Вынесено из useAdminBrush (правило ≤250 строк): там остаётся сам хук, здесь —
// перевод выбранного ассета в правку клетки и разбор ответа выгрузки.
import type { CellPatch } from "./patchMapCache";

export type BrushKind =
  | "terrain"
  | "road"
  | "decoration"
  | "chest"
  | "artifact"
  | "boss"
  | "building";

export type Brush = {
  kind: BrushKind;
  id: string;
  name: string;
} | null;

/**
 * Особые «типы местности» палитры: купол глухого тумана.
 *
 * Своего вида кисти купол не получает нарочно. Он относится к местности, но
 * ею НЕ является: под ним лежит настоящая земля со своей ценой хода, дорогой
 * и постройкой, и снятие возвращает клетку ровно в прежний вид. Отдельная
 * вкладка заставила бы админа искать инструмент там, где он его не ждёт, а
 * настоящим типом местности купол уже был — и покраска стирала то, что под ним.
 */
export const VOID_ON = "void:on";
export const VOID_OFF = "void:off";
/**
 * Сентинелы «выделения под биом-генератор». В карту НИЧЕГО не пишутся:
 * это временный маркер клетки в стороне от клеточной модели — «эти клетки
 * я хочу генерить». Живут в state редактора (Set ключей), не в БД. Кисть
 * рядом с куполом ровно по той же причине — краску для выделения искать
 * за пределами «Местности» админ не станет.
 */
export const GEN_ON = "gen:on";
export const GEN_OFF = "gen:off";

/** Выбран ли кистью купол (наложить или снять), а не обычный тип местности. */
export const isVoidBrush = (brush: Brush): boolean =>
  brush?.kind === "terrain" && (brush.id === VOID_ON || brush.id === VOID_OFF);

/** Кисть выделения под биом-генератор: клетки не красит, только помечает. */
export const isGenBrush = (brush: Brush): boolean =>
  brush?.kind === "terrain" && (brush.id === GEN_ON || brush.id === GEN_OFF);

/** Слой клетки, в который ложится выбранная кисть. */
export function patchFor(brush: NonNullable<Brush>): Omit<CellPatch, "q" | "r"> {
  // Купол пишет ТОЛЬКО свой флаг: terrainId он не трогает, поэтому местность,
  // дорога, декор и постройка под ним остаются нетронутыми.
  if (isVoidBrush(brush)) return { voidFog: brush.id === VOID_ON };
  if (brush.kind === "terrain") return { terrainId: brush.id };
  // Дорога ложится ПОВЕРХ местности и её не трогает: под дорогой остаётся своя
  // земля, а цена шага считается по дороге (hexStepCost.cellBaseCost).
  if (brush.kind === "road") return { roadId: brush.id };
  if (brush.kind === "decoration") return { decorationId: brush.id };
  if (brush.kind === "building") return { buildingId: brush.id };
  // Объекты хранятся с префиксом вида: «chest:tpl», «boss:tpl».
  return { objectId: `${brush.kind}:${brush.id}` };
}

/**
 * Какие клетки сервер НЕ принял (у них нет местности — объект на такой клетке
 * стал бы невидимой преградой). Отвечает он их списком; старый ответ отдавал
 * только число — тогда неизвестно, какие именно, и с очереди не снимаем
 * ничего: повторная выгрузка идемпотентна, а молча потерять правку нельзя.
 */
export function skippedKeys(res: { skipped?: unknown }, sent: string[]): string[] {
  const raw = res.skipped as unknown;
  if (Array.isArray(raw)) return raw.filter((k): k is string => typeof k === "string");
  return typeof raw === "number" && raw > 0 ? sent : [];
}

/**
 * Резать очередь на пачки под серверный лимит. Раньше выгрузка уезжала целиком:
 * накопил больше лимита — кнопка падала на проверке при КАЖДОМ нажатии, и
 * единственным выходом оставалось «Забыть», то есть потерять всю работу.
 */
export function chunkKeys(keys: string[], size: number): string[][] {
  const step = Math.max(1, size);
  const out: string[][] = [];
  for (let i = 0; i < keys.length; i += step) out.push(keys.slice(i, i + step));
  return out;
}
