// Арифметика очереди правок: что накопилось по клетке и вернулось ли как было.
//
// Вынесено из useAdminBrush (правило ≤250 строк): там остаётся сам хук, здесь —
// чистые функции, по которым видно, когда правка из очереди должна уйти.
import type { CellDetails, CellPatch, DraftState } from "./patchMapCache";
import { clampIconScale } from "@/lib/mergeScale";

/** Очередь после правки: новое состояние и клетки, вернувшиеся «как было». */
export type DraftStep = { next: DraftState; reverted: string[] };

/** Каким клетка была до правок — этим ластик отменяет свой же мазок целиком. */
export function restorePatch(q: number, r: number, start: CellDetails): CellPatch {
  return {
    q,
    r,
    terrainId: start.terrainId,
    roadId: start.roadId,
    decorationId: start.decorationId,
    objectId: start.objectId,
    buildingId: start.buildingId,
    tier: start.tier,
    alive: !start.defeated,
    voidFog: start.voidFog,
    groupId: start.groupId,
    iconScale: start.iconScale,
  };
}

/**
 * Слить правку с уже накопленной по этой клетке. Вернёт null, если клетка
 * вернулась к исходному виду: поставил и тут же стёр — выгружать нечего.
 */
export function mergeCellPatch(
  prev: CellPatch | undefined,
  patch: CellPatch,
  start: CellDetails,
): CellPatch | null {
  const merged = { ...prev, ...patch } as CellPatch;
  // Сменили постройку — её тир и настройки (текст таблички) уже не про неё. НО
  // смена ОБЛИКА (buildingSkinId в патче) постройку не меняет: «база» шлёт
  // buildingId базовой постройки только чтобы вернуть картинку, и стирать при
  // этом настроенный портал/текст нельзя.
  if (patch.buildingId !== undefined && patch.buildingSkinId === undefined) {
    if (patch.buildingConfig === undefined) delete merged.buildingConfig;
    if (patch.tier === undefined) delete merged.tier;
    // Убрали постройку — уходит и облик, выбранный ей до выгрузки: без постройки
    // он рисовался бы «призраком», которого не открыть и не убрать. Явное «снять
    // облик» (null) остаётся — оно про то же.
    if (patch.buildingId === null && merged.buildingSkinId) delete merged.buildingSkinId;
  }
  // Сменили объект — он приходит живым и без чужих настроек.
  if (patch.objectId !== undefined) {
    if (patch.objectConfig === undefined) delete merged.objectConfig;
    if (patch.alive === undefined) delete merged.alive;
  }
  const same =
    (merged.terrainId === undefined || merged.terrainId === start.terrainId) &&
    (merged.roadId === undefined || merged.roadId === start.roadId) &&
    (merged.decorationId === undefined || merged.decorationId === start.decorationId) &&
    (merged.objectId === undefined || merged.objectId === start.objectId) &&
    (merged.buildingId === undefined || merged.buildingId === start.buildingId) &&
    (merged.tier === undefined || merged.tier === start.tier) &&
    (merged.alive === undefined || merged.alive === !start.defeated) &&
    // Накрыл куполом и тут же снял — выгружать нечего, правка честно вылетает
    // из очереди вместе со счётчиком.
    (merged.voidFog === undefined || merged.voidFog === start.voidFog) &&
    // Блок и масштаб: объединил и разъединил — тоже «как было».
    (merged.groupId === undefined || (merged.groupId ?? null) === start.groupId) &&
    (merged.iconScale === undefined ||
      clampIconScale(merged.iconScale) === clampIconScale(start.iconScale));
  // Настройки клетки и ОБЛИК лежат отдельно (на сервере / в building_skin_id), а
  // не в колонках карты — сравнить с исходными нечем, поэтому такая правка живёт
  // в очереди до выгрузки, а не схлопывается в «как было».
  const extra =
    merged.buildingConfig !== undefined ||
    merged.objectConfig !== undefined ||
    merged.buildingSkinId !== undefined;
  return same && !extra ? null : merged;
}

/**
 * Очередь после мазка. Снимок «как было» фиксируется ДО обновления очереди:
 * иначе второй мазок по той же клетке падал бы на пустой базе. Правка,
 * схлопнувшаяся в ноль, уходит вместе со снимком — и клетку надо вернуть к
 * нему (reverted), иначе на карте останется мазок, которого нет ни в очереди,
 * ни на сервере.
 */
export function nextDraft(draft: DraftState, patch: CellPatch, before: CellDetails): DraftStep {
  const key = `${patch.q},${patch.r}`;
  const start = draft.base[key] ?? before;
  const merged = mergeCellPatch(draft.queue[key], patch, start);
  const queue = { ...draft.queue };
  const base = { ...draft.base };
  if (merged) {
    queue[key] = merged;
    base[key] = start;
    return { next: { queue, base }, reverted: [] };
  }
  delete queue[key];
  delete base[key];
  return { next: { queue, base }, reverted: [key] };
}

/**
 * Очередь после уехавшей пачки: снимаем ровно ТО, ЧТО СЕРВЕР ПРИНЯЛ. Клетка,
 * которую он пропустил (нет местности), остаётся ждать; остаётся и та, поверх
 * которой лёг свежий мазок, пока пакет ехал, — иначе правка исчезла бы молча,
 * а на карте остался бы мазок, которого нет ни в очереди, ни на сервере.
 */
export function dropSent(
  draft: DraftState,
  sent: Record<string, CellPatch>,
  part: string[],
  skipped: Set<string>,
): DraftState {
  const queue = { ...draft.queue };
  const base = { ...draft.base };
  for (const key of part) {
    if (skipped.has(key)) continue;
    if (queue[key] !== sent[key]) continue;
    delete queue[key];
    delete base[key];
  }
  return { queue, base };
}

/** Выбросить накопленное по клетке целиком — это отмена ластиком. */
export function dropCell(draft: DraftState, key: string): DraftStep {
  const queue = { ...draft.queue };
  const base = { ...draft.base };
  delete queue[key];
  delete base[key];
  return { next: { queue, base }, reverted: [key] };
}
