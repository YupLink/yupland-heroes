// Чистая арифметика панели зоны: ключи → клетки, ответ сервера → правки
// кисти, случайный рецепт без ИИ. Вынесено из useZoneGen, чтобы хук остался
// про состояние, а это можно было прогнать тестом без React.
import type { CellPatch } from "@/lib/raid/mapDelta";
import type { ZoneStructure } from "@/lib/raid/zonegen/settlement-types";
import {
  newSeed,
  type ZoneCell,
  type ZoneLayer,
  type ZonePatch,
  type ZoneRecipe,
} from "@/lib/raid/zonegen/recipe";

/** Ключи выделения «q,r» → координаты; битые ключи молча выпадают. */
export function cellsFromKeys(keys: Iterable<string>): ZoneCell[] {
  const out: ZoneCell[] = [];
  for (const k of keys) {
    const [q, r] = k.split(",").map(Number);
    if (Number.isFinite(q) && Number.isFinite(r)) out.push({ q, r });
  }
  return out;
}

/**
 * Патч генератора → правка кисти. Поля те же: terrainId ставится всегда,
 * decorationId = null стирает прежний декор — иначе старая ёлка осталась бы
 * стоять посреди новой воды.
 */
export function toCellPatches(patches: ZonePatch[]): CellPatch[] {
  return patches.map((p) => ({
    q: p.q,
    r: p.r,
    terrainId: p.terrainId,
    decorationId: p.decorationId,
  }));
}

/**
 * Постройки и дороги поселения → правки кисти. Тир едет В ТОМ ЖЕ патче, что и
 * постройка: очередь (mergeCellPatch) стирает тир у «другой постройки», и
 * присланный отдельной правкой он бы до выгрузки не дожил.
 *
 * Облик темы (buildingSkinId) — тоже в том же патче: сервер пишет облик и
 * building_id одним UPDATE (admin-live-batch), а облик без постройки на клетке
 * нарисовал бы картинку-призрак без механики.
 *
 * Поля кладём только те, что генератор прислал: лишний `roadId: undefined` в
 * патче безобиден, но отчёт «сколько клеток тронули» по нему не сходится.
 */
export function toStructurePatches(structures: ZoneStructure[]): CellPatch[] {
  return structures.map((s) => {
    const patch: CellPatch = { q: s.q, r: s.r };
    if (s.buildingId !== undefined) patch.buildingId = s.buildingId;
    if (s.buildingId && s.tier !== undefined) patch.tier = s.tier;
    if (s.buildingId && s.buildingSkinId !== undefined) patch.buildingSkinId = s.buildingSkinId;
    // Ставим дом — стираем ёлку: декор под постройкой генератор гасит сам.
    if (s.decorationId !== undefined) patch.decorationId = s.decorationId;
    if (s.roadId !== undefined) patch.roadId = s.roadId;
    return patch;
  });
}

/** Случайное целое из [lo, hi]. */
const randInt = (lo: number, hi: number, rnd: () => number): number =>
  lo + Math.floor(rnd() * (hi - lo + 1));

/**
 * Рецепт без ИИ: 2–4 случайных местности справочника с случайными весами.
 * Масштаб, декор и порог малой зоны берутся из прежнего рецепта — крутил их
 * админ, а не жребий. Справочник короче двух — берём, что есть.
 */
export function randomRecipe(
  terrainIds: string[],
  prev: ZoneRecipe,
  rnd: () => number = Math.random,
): ZoneRecipe {
  const pool = [...terrainIds];
  const want = Math.min(pool.length, randInt(2, 4, rnd));
  const layers: ZoneLayer[] = [];
  for (let i = 0; i < want; i++) {
    const at = Math.floor(rnd() * pool.length);
    const [terrainId] = pool.splice(at, 1);
    layers.push({ terrainId, weight: randInt(10, 60, rnd) });
  }
  if (layers.length === 0) return prev;
  return { ...prev, seed: newSeed(), layers };
}

/**
 * Следующий слой для «+ слой»: первая местность, которой в рецепте ещё нет;
 * все заняты — повторяем первую (пусть админ сам выберет в select).
 */
export function nextLayer(terrainIds: string[], layers: ZoneLayer[]): ZoneLayer | null {
  if (terrainIds.length === 0) return null;
  const used = new Set(layers.map((l) => l.terrainId));
  const terrainId = terrainIds.find((id) => !used.has(id)) ?? terrainIds[0];
  return { terrainId, weight: 20 };
}

/** Число из поля ввода в границах [lo, hi]; мусор → lo. */
export function clampNum(raw: string | number, lo: number, hi: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/** Ключ клетки в очереди кисти и в памяти прошлой генерации. */
export const cellKey = (c: { q: number; r: number }): string => `${c.q},${c.r}`;

/** Ключи клеток, которые прошлая генерация заняла постройкой или дорогой. */
export function structureKeys(structures: ZoneStructure[]): Set<string> {
  return new Set(structures.map(cellKey));
}

/**
 * Снятие прошлой генерации — ПОЛЕ ЗА ПОЛЕМ, а не клетка целиком.
 *
 * Очередь кисти хранит правки по одному полю (mergeCellPatch), поэтому «новая
 * генерация тронула клетку» ещё не значит «дом с неё ушёл»: на месте двора
 * первого прогона второй кладёт улицу — и в очереди остаётся дом ПОД улицей.
 * Так и копился город на городе (владелец, 24.09: «приходилось удалять,
 * удалять, удалять»). Снимаем ровно то, что прошлый прогон поставил, а
 * нынешний на этой клетке не ставит.
 */
export function clearPatches(prev: ZoneStructure[], next: ZoneStructure[]): CellPatch[] {
  const now = new Map(next.map((s) => [cellKey(s), s]));
  const out: CellPatch[] = [];
  for (const was of prev) {
    const n = now.get(cellKey(was));
    // Облик прошлого города, которого новый на этой клетке не ставит. Очередь
    // сливает правки по полям, и без снятия «Кабан» пережил бы свой дом (карта
    // рисует клетку по skin — призрак на пустыре) или перешёл бы на чужой дом
    // без облика. Отдельной правкой и ПЕРВЫМ: mergeCellPatch чистит тир
    // только у правки постройки без облика, и снятие дома ниже уносит его штатно.
    if (was.buildingSkinId != null && n?.buildingSkinId == null) {
      out.push({ q: was.q, r: was.r, buildingSkinId: null });
    }
    const patch: CellPatch = { q: was.q, r: was.r };
    let any = false;
    // Дом: тир и настройки очередь снимет сама вслед за buildingId.
    if (was.buildingId != null && n?.buildingId == null) {
      patch.buildingId = null;
      any = true;
    }
    // Чужую дорогу зоны прошлый прогон не трогал — снимаем только свою.
    if (was.roadId != null && n?.roadId == null) {
      patch.roadId = null;
      any = true;
    }
    if (any) out.push(patch);
  }
  return out;
}

/**
 * Клетки, занятые НЕВЫГРУЖЕННЫМИ правками очереди кисти, кроме клеток прошлой
 * генерации (их мы и так снимаем). Сервер считает занятым только то, что уже
 * в базе, и без этого списка второй прогон ставил дома вплотную к домам
 * первого — их для него не существовало.
 *
 * Объект считается занятостью наравне с постройкой: руками поставленный и ещё
 * не выгруженный сундук для базы не существует, а дом на него встанет
 * (владелец, 24.09: «здание спавнится на объекты»).
 */
export function busyFromDraft(
  queue: Record<string, CellPatch>,
  mine: Set<string>,
  max: number,
  /** Клетки зоны: правки вне выделения серверу ничего не говорят, а место в
   * потолке занимают — в большой сессии режима бога очередь длиннее зоны. */
  within?: Set<string>,
): ZoneCell[] {
  const out: ZoneCell[] = [];
  for (const key of Object.keys(queue)) {
    if (mine.has(key)) continue;
    if (within !== undefined && !within.has(key)) continue;
    const p = queue[key];
    if (!p?.buildingId && !p?.objectId) continue;
    out.push({ q: p.q, r: p.r });
    if (out.length >= max) break;
  }
  return out;
}
