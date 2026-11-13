// Точечная правка карты в кэше — вместо перезапроса всех 16 384 клеток.
//
// Карта приходит колонками и весит секунды на чтение (замер: ~2.2 с). После
// админской правки одной клетки перечитывать всё — это ждать три секунды на
// каждый клик. Здесь тот же слой правится прямо в кэше: карта перерисовывается
// мгновенно, а полное обновление придёт своим чередом по SSE.
//
// Очередь правок накладывается ОДНИМ проходом (applyCellPatches): раньше на
// каждую клетку очереди клонировались все колонки, и сорок накопленных мазков
// на каждое чужое событие означали сорок полных копий карты.
//
// Сам проход тоже больше не копирует карту: колонки клонирует PackedEdit —
// только те, которых правка коснулась, — а индекс "q,r"→строка переезжает на
// новые колонки как есть (cellIndex). Мазок кистью перестал быть поводом
// пересобирать всё, что построено поверх карты.
import type { PackedCells } from "./unpackMap";
import { PackedEdit } from "./packedEdit";
import { addAssetsToDicts, type AssetLookup, type MapDicts } from "./cellAssets";
import { clampIconScale } from "@/lib/mergeScale";
import { mineAfterPatch, type BuildingEntry } from "./packedMines";
import { applyVeinEdits, veinEditOf, type VeinEdit } from "./veinPatch";

export type MapLike =
  | (MapDicts & {
      packed: PackedCells | null;
      map?: { id: string } | null;
      buildingTiers?: Record<string, number>;
      /** Клетки с невыгруженными правками — метка черновика в самом кэше. */
      draftCells?: string[];
    })
  | undefined;

// Форма правки общая с сервером (журнал и живой канал шлют её же).
export type { CellPatch } from "@/lib/raid/mapDelta";
import type { CellPatch, MapDeltaAssets } from "@/lib/raid/mapDelta";

/** Пометить (или снять) индекс в наборе; true — набор и правда изменился. */
function mark(set: Set<number>, i: number, on: boolean): boolean {
  if (!on) return set.delete(i);
  if (set.has(i)) return false;
  set.add(i);
  return true;
}

/** Наложить пачку правок, клонируя только затронутые колонки. */
export function applyCellPatches(
  old: MapLike,
  patches: CellPatch[],
  assets?: AssetLookup,
  /** Готовые записи словарей с сервера (дельта карты): кладутся как есть. */
  entries?: MapDeltaAssets,
): MapLike {
  if (!old?.packed || patches.length === 0) return old;
  const p = old.packed;
  if (entries) old = mergeDictEntries(old, entries);
  const edit = new PackedEdit(p);
  const dead = new Set(p.defeated);
  // ?? [] — карта из старого суточного кэша приезжает без этих колонок.
  const dome = new Set(p.voidFog ?? []);
  const runners = new Set(p.runners ?? []);
  const mines = new Set(p.mines ?? []);
  // Словари — до прохода: отметке шахты нужна запись свежепоставленной постройки.
  const dicts = addAssetsToDicts(old, patches, assets);
  const buildings = (dicts?.buildings ?? old.buildings ?? {}) as Record<string, BuildingEntry>;
  const entryOf = (id: string) => buildings[id];
  // Блоки: индекс клетки → [индекс блока в groupIds, масштаб %] из троек.
  const groups = new Map<number, [number, number]>();
  for (let k = 0, flat = p.groups ?? []; k + 2 < flat.length; k += 3)
    groups.set(flat[k], [flat[k + 1], flat[k + 2]]);
  let deadDirty = false;
  let domeDirty = false;
  let runnersDirty = false;
  let minesDirty = false;
  let groupsDirty = false;
  // Жилы (veinPatch): номер клетки → жила; тройки списка правятся после прохода.
  const veins = new Map<number, VeinEdit>();
  const tiers = { ...(old.buildingTiers ?? {}) };

  for (const patch of patches) {
    const key = `${patch.q},${patch.r}`;
    let i = edit.rowOf(key);
    const layers =
      patch.terrainId !== undefined ||
      patch.roadId !== undefined ||
      patch.decorationId !== undefined ||
      patch.objectId !== undefined ||
      patch.buildingId !== undefined ||
      patch.buildingSkinId !== undefined;
    // Правка без слоёв (тир, настройки, живость, купол) новую клетку не
    // заводит: пустая клетка без местности рисовалась бы дырой в карте. Купол
    // сюда входит нарочно — сервер накрывает только клетку с местностью, и
    // карта не должна расходиться с базой на клетку-призрак.
    if (i === undefined && !layers) {
      if (patch.tier !== undefined) tiers[key] = patch.tier;
      continue;
    }
    // Клетки в карте ещё не было — заводим её в конце колонок.
    if (i === undefined) i = edit.addRow(key, patch.q, patch.r);
    const wasObject = edit.idAt("objectIds", edit.read("obj", i));
    const wasBuilding = edit.idAt("buildingIds", edit.read("bld", i));

    if (patch.terrainId !== undefined) {
      edit.set("t", i, edit.poolIndex("terrainIds", patch.terrainId));
    }
    // Дорога — свой слой поверх местности: местность под ней остаётся своя,
    // и снятие дороги (null) возвращает клетке цену шага её земли. Дорога на
    // клетке ОДНА — кисть её заменяет, а не докладывает.
    if (patch.roadId !== undefined) {
      edit.set("road", i, edit.poolIndex("roadIds", patch.roadId));
    }
    if (patch.decorationId !== undefined) {
      edit.set("dec", i, edit.poolIndex("decorationIds", patch.decorationId));
    }
    if (patch.objectId !== undefined) {
      edit.set("obj", i, edit.poolIndex("objectIds", patch.objectId));
      // Метку «добыт» снимает только СМЕНА объекта. Повторный мазок тем же
      // самым (мазнули кистью по уже стоящему сундуку) не воскрешает добытое.
      if ((patch.objectId ?? null) !== wasObject) {
        deadDirty = mark(dead, i, false) || deadDirty;
        // Объект сменился — прежняя метка «это беглец» с ним и уходит.
        runnersDirty = mark(runners, i, false) || runnersDirty;
      }
    }
    // Идёт после объекта: правка «на клетку прибежал беглец» ставит и то, и другое.
    if (patch.runner !== undefined) {
      runnersDirty = mark(runners, i, patch.runner) || runnersDirty;
    }
    // Идёт после объекта: «погасить» на уже стоящем объекте не должно потеряться.
    if (patch.alive !== undefined) deadDirty = mark(dead, i, !patch.alive) || deadDirty;
    if (patch.buildingId !== undefined) {
      edit.set("bld", i, edit.poolIndex("buildingIds", patch.buildingId));
      // Тир уходит только вместе со СМЕНОЙ постройки: следующая начинает с
      // нуля. Мазок той же постройкой — не смена, и оплаченный игроками тир
      // остаётся на месте (иначе кисть обнуляла чужую верфь третьего тира).
      if ((patch.buildingId ?? null) !== wasBuilding) delete tiers[key];
    }
    // Облик: колонка bld показывает «skin:<id>» (картинку берёт словарь), но это
    // та же постройка — тир не трогаем. null пришёл с buildingId базовой
    // постройки выше и уже вернул bld к ней.
    if (patch.buildingSkinId) {
      edit.set("bld", i, edit.poolIndex("buildingIds", `skin:${patch.buildingSkinId}`));
    }
    if (patch.tier !== undefined) tiers[key] = patch.tier;
    // Шахта — стена (§8.59 п. 9): отметку правит смена постройки или её настроек.
    const mine = mineAfterPatch(patch, entryOf, wasBuilding);
    if (mine !== undefined) minesDirty = mark(mines, i, mine) || minesDirty;
    // Купол — последним: он ничего под собой не переписывает и от порядка
    // остальных слоёв не зависит.
    if (patch.voidFog !== undefined) domeDirty = mark(dome, i, patch.voidFog) || domeDirty;
    const vein = veinEditOf(patch);
    if (vein !== undefined) veins.set(i, vein);
    // Блок: null — вывести из блока (масштаб уходит с ним); id — вступить,
    // масштаб — из патча, иначе прежний, иначе 100 %. Масштаб без блока — только
    // у уже состоящих в блоке клеток.
    if (patch.groupId === null) {
      if (groups.delete(i)) groupsDirty = true;
    } else if (patch.groupId !== undefined) {
      const was = groups.get(i);
      const pct =
        patch.iconScale != null
          ? Math.round(clampIconScale(patch.iconScale) * 100)
          : (was?.[1] ?? 100);
      groups.set(i, [edit.poolIndex("groupIds", patch.groupId), pct]);
      groupsDirty = true;
    } else if (patch.iconScale != null) {
      const was = groups.get(i);
      if (was) {
        groups.set(i, [was[0], Math.round(clampIconScale(patch.iconScale) * 100)]);
        groupsDirty = true;
      }
    }
  }

  // Списки переписываем, только если состав и правда поменялся: новый массив с
  // тем же содержимым — это лишний повод пересобрать клетки ниже по течению.
  if (deadDirty) edit.setList("defeated", [...dead]);
  if (domeDirty) edit.setList("voidFog", [...dome]);
  if (runnersDirty) edit.setList("runners", [...runners]);
  if (minesDirty) edit.setList("mines", [...mines]);
  const veinList = applyVeinEdits(p.veins, veins);
  if (veinList) edit.setList("veins", veinList);
  if (groupsDirty) {
    const flat: number[] = [];
    for (const [i, [gi, pct]] of groups) flat.push(i, gi, pct);
    edit.setList("groups", flat);
  }
  return { ...old, ...dicts, packed: edit.finish(), buildingTiers: tiers };
}

/** Словари с сервера поверх своих: новые id появляются, прежние не трогаем. */
function mergeDictEntries(
  old: NonNullable<MapLike>,
  entries: MapDeltaAssets,
): NonNullable<MapLike> {
  const out = { ...old };
  for (const kind of ["terrains", "roads", "objects", "decorations", "buildings"] as const) {
    const add = entries[kind];
    if (!add || Object.keys(add).length === 0) continue;
    out[kind] = { ...(old[kind] ?? {}), ...add };
  }
  return out;
}

/** Одна правка — частный случай пачки. */
export function patchMapCache(old: MapLike, patch: CellPatch, assets?: AssetLookup): MapLike {
  return applyCellPatches(old, [patch], assets);
}

// Чтение состава клетки и типы черновика — в cellDetails.ts (≤250 строк).
export { readCellDetails, readManyCells, type CellDetails, type DraftState } from "./cellDetails";
