// Свежепоставленный кистью ассет — глазами карты.
//
// В колонках карты лежат только индексы её словарей (terrains / objects /
// decorations / buildings), а сами словари приходят с сервера. Кисть режима
// бога дописывала id в колонку, но не в словарь: карта про новый ассет ничего
// не знала — рисовала пустоту, а «вода ли это» считается по ИМЕНИ местности
// (lib/shipRules.isWaterName), которого тоже не было: свежепрокопанный пролив
// выглядел проходимым посуху.
//
// Имя, картинку и длину цепочки тиров знает палитра — она держит их в кэше
// ["admin-live-assets", kind]. Отсюда и берём, пока не приехала настоящая карта.
//
// Но одной палитры мало: кэш react-query персистится общим блобом, и смена
// buster'а выбрасывает его ЦЕЛИКОМ — вместе с картой уходит и палитра. Черновик
// лежит в своём ключе и выкат переживает, поэтому первый заход админа после
// выката поднимал очередь, накладывал её на свежую карту и не находил про свои
// же ассеты ничего: местность без картинки и с ценой 1, свежепрокопанная вода
// снова посуху, у постройки ноль тиров.
//
// Поэтому черновик носит ассеты С СОБОЙ: снимок снимается в момент мазка, когда
// палитра заведомо в руках (админ только что выбрал из неё кисть), и при
// наложении черновика идёт ПЕРВЫМ источником, а кэш палитры остаётся запасным.
import type { QueryClient } from "@tanstack/react-query";
import { readDraftAssets, writeDraftAssets } from "./adminDraftStore";
import type { CellPatch } from "./patchMapCache";

/** Ассет из кэша палитры режима бога (AdminCellPalette.Asset). */
export type PaletteAsset = {
  id: string;
  name: string;
  imageUrl: string | null;
  /** Сколько у постройки тиров; у остальных видов — 0. */
  tiers?: number;
  /** Цена шага по местности (stat_amount справочника). */
  cost?: number;
};

export type AssetLookup = (kind: string, id: string) => PaletteAsset | null;

/** Словари карты — те же, что собирает сервер (api/beta-raid/map-assets.ts). */
export type MapDicts = {
  terrains?: Record<string, unknown>;
  /** Дороги: свой словарь, но устроен как местность — имя, картинка, цена шага. */
  roads?: Record<string, unknown>;
  objects?: Record<string, unknown>;
  decorations?: Record<string, unknown>;
  buildings?: Record<string, unknown>;
};

/** Снимки ассетов черновика: «вид:id» → чем этот ассет был в палитре. */
export type AssetSnapshots = Record<string, PaletteAsset>;

/** Ключ снимка. У объектов он совпадает с их id на карте («boss:шаблон»). */
export const assetKey = (kind: string, id: string): string => `${kind}:${id}`;

/** Ассеты берём из кэша палитры: там уже лежит то, чем админ красит. */
export function paletteLookup(qc: QueryClient): AssetLookup {
  return (kind, id) =>
    qc.getQueryData<PaletteAsset[]>(["admin-live-assets", kind])?.find((a) => a.id === id) ?? null;
}

/** Какие ассеты трогает правка — те же пары «вид+id», что ищет addAssetsToDicts. */
function refsOf(p: CellPatch): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (p.terrainId) out.push(["terrain", p.terrainId]);
  if (p.roadId) out.push(["road", p.roadId]);
  if (p.decorationId) out.push(["decoration", p.decorationId]);
  if (p.buildingId) out.push(["building", p.buildingId]);
  // Облик клетки рисуется как постройка «skin:<id>» — его картинку словарю тоже
  // даёт снимок черновика, иначе клетка с обликом уехала бы без картинки.
  if (p.buildingSkinId) out.push(["building", `skin:${p.buildingSkinId}`]);
  if (p.objectId) {
    const { kind, templateId } = splitObjectId(p.objectId);
    out.push([kind, templateId]);
  }
  return out;
}

/**
 * Снимок без пустот: черновик уезжает в localStorage, и хранить там «цена 1,
 * тиров 0» — платить за умолчания. Читателю они всё равно вернутся теми же
 * значениями (Number(undefined) || 1).
 */
function trim(a: PaletteAsset): PaletteAsset {
  const out: PaletteAsset = { id: a.id, name: a.name, imageUrl: a.imageUrl ?? null };
  // «Задана и не единица», а не «больше единицы»: дороги как раз ДЕШЕВЛЕ земли
  // (0.5), и с прежним условием пережившая выкат правка возвращала дорогу с
  // ценой 1 — кружок обещал один шаг, сервер списывал полшага.
  const cost = Number(a.cost);
  if (cost && cost !== 1) out.cost = cost;
  if (Number(a.tiers) > 0) out.tiers = Number(a.tiers);
  return out;
}

/**
 * Снимки ровно под текущую очередь: уже снятые остаются как есть (палитра могла
 * с тех пор и уехать), недостающие снимаются с палитры, лишние выпадают —
 * выгруженная клетка не должна годами таскать свой ассет по localStorage.
 *
 * Один снимок на АССЕТ, а не на клетку: тысяча мазков одной травой — одна
 * запись, и та около двухсот байт (замер с настоящим IPFS-адресом картинки).
 */
export function snapshotAssets(
  queue: Record<string, CellPatch>,
  prev: AssetSnapshots,
  lookup: AssetLookup,
): AssetSnapshots {
  const out: AssetSnapshots = {};
  for (const p of Object.values(queue)) {
    for (const [kind, id] of refsOf(p)) {
      const key = assetKey(kind, id);
      if (out[key]) continue;
      const known = prev[key];
      if (known) {
        out[key] = known;
        continue;
      }
      const fresh = lookup(kind, id);
      if (fresh) out[key] = trim(fresh);
    }
  }
  return out;
}

/** Снимок черновика — первый источник, кэш палитры — запасной. */
export function snapshotLookup(snap: AssetSnapshots, fallback?: AssetLookup): AssetLookup {
  return (kind, id) => snap[assetKey(kind, id)] ?? fallback?.(kind, id) ?? null;
}

/** Тот же порядок для живого экрана: сначала снимки черновика, потом палитра. */
export function draftLookup(qc: QueryClient): AssetLookup {
  return snapshotLookup(readDraftAssets(), paletteLookup(qc));
}

/** Переснять снимки под очередь. Зовётся там, где палитра ТОЧНО в руках. */
export function syncDraftAssets(qc: QueryClient, queue: Record<string, CellPatch>): void {
  writeDraftAssets(snapshotAssets(queue, readDraftAssets(), paletteLookup(qc)));
}

/**
 * Цепочка тиров постройки. Палитра знает только их ЧИСЛО — значит потолок «+»
 * в окне клетки честный сразу, а картинка у всех тиров пока одна, шаблонная:
 * настоящие облики приедут с картой. Ноль тиров в шаблоне — всё равно рисуем
 * один, иначе свежая постройка на карте невидима.
 */
function tiersOf(asset: PaletteAsset): Array<{ name: string; imageUrl: string | null }> {
  const count = Math.max(1, Number(asset.tiers) || 0);
  return Array.from({ length: count }, () => ({ name: asset.name, imageUrl: asset.imageUrl }));
}

/** Объекты хранятся как «вид:шаблон» — сундук и босс различимы по префиксу. */
function splitObjectId(raw: string): { kind: string; templateId: string } {
  const at = raw.indexOf(":");
  if (at <= 0) return { kind: "chest", templateId: raw };
  return { kind: raw.slice(0, at), templateId: raw.slice(at + 1) };
}

/**
 * Дописать в словари карты всё, что кисть только что поставила. Возвращает
 * только изменённые словари (или null, если всё уже известно): лишняя копия
 * словаря рвёт ссылку и заставляет канвас перезагружать все картинки.
 */
export function addAssetsToDicts(
  map: MapDicts,
  patches: CellPatch[],
  lookup: AssetLookup | undefined,
): MapDicts | null {
  if (!lookup) return null;
  const out: MapDicts = {};
  const dict = (field: keyof MapDicts): Record<string, unknown> =>
    (out[field] ??= { ...(map[field] ?? {}) });
  const known = (field: keyof MapDicts, id: string): boolean =>
    id in (out[field] ?? map[field] ?? {});

  for (const p of patches) {
    if (p.terrainId && !known("terrains", p.terrainId)) {
      const a = lookup("terrain", p.terrainId);
      // cost — цена шага, и она у палитры есть (stat_amount справочника, то же
      // правило, что у сервера карты). Раньше здесь стояла единица: кружок
      // обещал шаг за одну энергию, а сервер списывал цену СТАРОЙ местности —
      // что показано, то и списывается, иначе болото ходится как тропинка.
      // Проходимость воды карта смотрит по name — а имя у нас есть, и пролив
      // сразу перестаёт быть проезжей частью.
      if (a) {
        dict("terrains")[p.terrainId] = {
          id: p.terrainId,
          name: a.name,
          imageUrl: a.imageUrl,
          cost: Number(a.cost) || 1,
        };
      }
    }
    if (p.roadId && !known("roads", p.roadId)) {
      const a = lookup("road", p.roadId);
      // cost обязателен: цену шага по дороге сервер берёт из справочника
      // (helpers.cellMoveCost), и без неё кружок обещал бы единицу там, где
      // спишется полшага. Картинка нужна канвасу — из неё печётся тайл дороги.
      if (a) {
        dict("roads")[p.roadId] = {
          id: p.roadId,
          name: a.name,
          imageUrl: a.imageUrl,
          cost: Number(a.cost) || 1,
        };
      }
    }
    if (p.decorationId && !known("decorations", p.decorationId)) {
      const a = lookup("decoration", p.decorationId);
      if (a) {
        dict("decorations")[p.decorationId] = {
          id: p.decorationId,
          name: a.name,
          imageUrl: a.imageUrl,
        };
      }
    }
    if (p.objectId && !known("objects", p.objectId)) {
      const { kind, templateId } = splitObjectId(p.objectId);
      const a = lookup(kind, templateId);
      if (a) {
        // meta шаблона (HP объекта) палитра не носит: до приезда карты объект
        // считается боевым, а не «забирается тапом». Вид берём из префикса —
        // босс останется боссом.
        dict("objects")[p.objectId] = {
          id: p.objectId,
          name: a.name,
          imageUrl: a.imageUrl,
          mapImageUrl: a.imageUrl,
          meta: null,
          kind,
        };
      }
    }
    if (p.buildingId && !known("buildings", p.buildingId)) {
      const a = lookup("building", p.buildingId);
      if (a) {
        dict("buildings")[p.buildingId] = { id: p.buildingId, name: a.name, tiers: tiersOf(a) };
      }
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}
