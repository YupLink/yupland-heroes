// Черновик режима бога поверх кэша: как невыгруженные правки держатся на карте.
//
// Где черновик лежит и почему переживает перезагрузку — в adminDraftStore.
// Здесь вторая половина: чужие события («построили», «восстановили»), свой же
// рефетч после выгрузки и опрос живого списка приносят данные БЕЗ наших
// правок — карта откатывалась на глазах, хотя очередь была цела. Подписка на
// кэш кладёт очередь обратно и — главное — переснимает базу отмены по свежим
// серверным данным: старый снимок вернул бы клетку в состояние, которого на
// сервере уже нет, а mergeCellPatch выбросил бы настоящую правку как «вернулось
// как было».
import type { QueryClient } from "@tanstack/react-query";
import {
  applyCellPatches,
  readManyCells,
  type CellPatch,
  type DraftState,
  type MapLike,
} from "./patchMapCache";
import { restorePatch } from "./mergeCellPatch";
import { draftLookup } from "./cellAssets";
import { draft, loadDraft, readDraftMapId, saveDraft, takeRestored } from "./adminDraftStore";

type LiveList = { defeated?: string[] } | undefined;

const MAP_KEY = ["beta-raid-map"];
const LIVE_KEY = ["beta-raid-players"];

/** Наша же запись в кэш живого списка: на неё не реагируем. */
let writing = false;
/**
 * Карта, на которой черновик уже сверяли; undefined — ещё ни разу. Раньше здесь
 * стоял флаг «проверено» на всю загрузку страницы, и смену активной карты
 * ПОСРЕДИ сессии проверка не замечала вовсе — черновик прошлой карты доживал до
 * «Выгрузить».
 */
let checkedMapId: string | null | undefined;

const mapOf = (qc: QueryClient): MapLike => qc.getQueryData(MAP_KEY) as MapLike;
/** Записать черновик как есть: метку карты чужие обновления не трогают. */
const persist = () => saveDraft();
/** То же, но с кандидатом в метку — она ставится ОДИН раз, на первой правке. */
const persistNew = (qc: QueryClient) => saveDraft(mapOf(qc)?.map?.id ?? null);

/** С какой карты снят черновик: её же имя уезжает с пакетом на сервер. */
export const draftMapId = (qc: QueryClient): string | null =>
  readDraftMapId() ?? mapOf(qc)?.map?.id ?? null;

/**
 * Правка ставит на клетку ДРУГОЙ объект? Тогда метка смерти уже не про него.
 * Карта это умеет сама (patchMapCache), а живой список — нет, и он затирал
 * метку карты: свежепоставленный босс выходил погашенным, тапом не открывался
 * и герои ходили сквозь него.
 */
function swapsObject(p: CellPatch): boolean {
  if (p.objectId === undefined) return false;
  const start = draft.base[`${p.q},${p.r}`];
  return !!start && (p.objectId ?? null) !== start.objectId;
}

/** Живые «добытые» с учётом черновика: «погасить/оживить» ещё не на сервере. */
function applyDefeated(qc: QueryClient, patches: CellPatch[]): void {
  const marks = patches.filter((p) => p.alive !== undefined || swapsObject(p));
  if (marks.length === 0) return;
  writing = true;
  try {
    qc.setQueryData(LIVE_KEY, (old: LiveList) => {
      if (!old) return old;
      const list = old.defeated ?? [];
      const set = new Set(list);
      for (const p of marks) {
        const key = `${p.q},${p.r}`;
        // Сначала смена объекта, потом явное «погасить»: админ мог поставить
        // объект и тут же пометить его добытым — последнее слово за ним.
        if (swapsObject(p)) set.delete(key);
        if (p.alive === true) set.delete(key);
        if (p.alive === false) set.add(key);
      }
      if (set.size === list.length && list.every((k) => set.has(k))) return old;
      return { ...old, defeated: [...set] };
    });
  } finally {
    writing = false;
  }
}

/** Положить черновик на карту и на живой список; extra — правки-возвраты. */
function applyDraft(qc: QueryClient, extra: CellPatch[] = []): void {
  const keys = Object.keys(draft.queue);
  const patches = [...extra, ...Object.values(draft.queue)];
  const map = mapOf(qc);
  // Пустой черновик трогает карту, только чтобы снять с неё метку.
  if (map && (patches.length > 0 || map.draftCells)) {
    qc.setQueryData(MAP_KEY, (old: unknown) => {
      const next = applyCellPatches(old as MapLike, patches, draftLookup(qc));
      return next ? { ...next, draftCells: keys.length > 0 ? keys : undefined } : next;
    });
  }
  applyDefeated(qc, patches);
}

/**
 * Записать черновик и показать его. `reverted` — клетки, чьи правки выброшены:
 * их возвращаем к снимку, иначе на карте остаётся мазок, которого нет ни в
 * очереди, ни на сервере (так стирался оплаченный игроками тир постройки).
 */
export function commitDraft(qc: QueryClient, next: DraftState, reverted: string[] = []): void {
  loadDraft();
  const back: CellPatch[] = [];
  for (const key of reverted) {
    const start = draft.base[key];
    if (!start) continue;
    const [q, r] = key.split(",").map(Number);
    back.push(restorePatch(q, r, start));
  }
  draft.queue = next.queue;
  draft.base = next.base;
  persistNew(qc);
  applyDraft(qc, back);
}

/** Забыть весь черновик и вернуть карту со списком «добытых» к снимкам. */
export function dropDraft(qc: QueryClient): void {
  loadDraft();
  // Считать нечего: сказать «восстановлено N правок» после того, как эти же N
  // выброшены, — значит соврать дважды в двух соседних всплывашках.
  draft.restored = 0;
  const here = mapOf(qc)?.map?.id ?? null;
  // Снимки сняты с ДРУГОЙ карты — откатывать по ним нечего: чужая местность,
  // чужие объекты и чужие «добытые» вписались бы в кэш текущей карты. Такой
  // черновик просто забывается, а карта перечитывается с сервера.
  const foreign = !!draft.mapId && !!here && draft.mapId !== here;
  commitDraft(qc, { queue: {}, base: {} }, foreign ? [] : Object.keys(draft.queue));
}

/**
 * Переснять базу отмены по свежей карте с сервера.
 *
 * Метка «добыт» берётся из САМОЙ КАРТЫ, а не из кэша живого списка: в него
 * applyDefeated уже вписал невыгруженное «погасить», и снимок «как было»
 * запоминал бы собственную правку — ластик-отмена возвращала клетку в
 * погашенное, а mergeCellPatch выбрасывал бы правку как вернувшуюся как было.
 * Карта здесь только что пришла с сервера (fromServer, до наложения очереди), а
 * «добытых» считает теми же строками beta_raid_object_hp, что и живой список.
 */
function resnapshot(qc: QueryClient): void {
  const keys = Object.keys(draft.queue);
  if (keys.length === 0) return;
  const map = mapOf(qc);
  if (!map?.packed) return;
  draft.base = readManyCells(map, keys);
  persist();
}

/**
 * То же для метки «добыт» по живому списку: он идёт отдельным запросом и между
 * перечитываниями карты знает о добытом раньше неё. Зовётся ТОЛЬКО на серверном
 * ответе — то есть до того, как applyDefeated положит поверх нашу очередь.
 */
function resnapshotDefeated(qc: QueryClient): void {
  const live = qc.getQueryData<LiveList>(LIVE_KEY)?.defeated;
  if (!live) return;
  const dead = new Set(live);
  for (const key of Object.keys(draft.base)) {
    draft.base[key] = { ...draft.base[key], defeated: dead.has(key) };
  }
  persist();
}

export type DraftNote = "staleMap" | "otherMap" | "restored";
export type NoteFn = (note: DraftNote, count?: number) => void;

/**
 * Встреча с КАЖДОЙ НОВОЙ картой: из localStorage она могла прийти с черновыми
 * мазками, к которым не осталось очереди, или от вовсе другой активной карты
 * рейда. Такой карте не верим — перечитываем.
 *
 * Сверяем именно смену карты, а не «первый раз за загрузку страницы»: активную
 * бета-карту переключают на живом сервере, и черновик прошлой обязан уйти
 * вместе с ней — иначе его правки лягут по тем же координатам новой.
 *
 * Здесь же решается судьба поднятого из localStorage черновика — поэтому
 * отсюда же о ней и объявляем. Сказать «восстановлено N» раньше проверки
 * значило пообещать правки, которые через миг будут выброшены как чужие.
 */
function verifyDraft(qc: QueryClient, onNote: NoteFn): void {
  const map = mapOf(qc);
  if (!map) return;
  const here = map.map?.id ?? null;
  // Стартовое undefined не равно ни строке, ни null: первую карту проверяем.
  if (checkedMapId === here) return;
  checkedMapId = here;
  loadDraft();
  const mine = new Set(Object.keys(draft.queue));
  const refetch = () => queueMicrotask(() => void qc.resetQueries({ queryKey: MAP_KEY }));
  if (draft.mapId && map.map?.id && draft.mapId !== map.map.id && mine.size > 0) {
    dropDraft(qc);
    onNote("otherMap");
    refetch();
    return;
  }
  if (!(map.draftCells ?? []).every((k) => mine.has(k))) {
    onNote("staleMap");
    // Перечитывание внутри уведомления кэша — отложенно, чтобы не менять кэш
    // прямо во время обхода его же слушателей.
    refetch();
  }
  // Черновик проверку пережил — только теперь «восстановлено» правда.
  const back = takeRestored();
  if (back > 0) onNote("restored", back);
}

/**
 * Держать черновик поверх любых чужих обновлений. Возвращает отписку.
 *
 * Для карты реагируем только на СЕРВЕРНЫЕ данные (manual !== true):
 * собственная запись в кэш — это и есть наложение черновика, гоняться за своим
 * хвостом незачем. Живой список правят и опрос, и поток чужих событий, поэтому
 * там смотрим не на источник, а на собственный флаг записи.
 *
 * `onSync` зовётся после каждой проверки черновика: отбраковать его здесь и не
 * сказать об этом экрану — значит оставить на кнопке «Выгрузить · 12» правки,
 * которых уже нет. Очередь одна, и состояние экрана берётся из неё.
 */
export function watchDraft(qc: QueryClient, onNote: NoteFn, onSync: () => void): () => void {
  loadDraft();
  verifyDraft(qc, onNote);
  onSync();
  applyDraft(qc);
  return qc.getQueryCache().subscribe((event) => {
    const k0 = Array.isArray(event.query.queryKey) ? event.query.queryKey[0] : null;
    if (k0 !== "beta-raid-map" && k0 !== "beta-raid-players") return;
    const action =
      event.type === "updated" ? (event.action as { type: string; manual?: boolean }) : null;
    const fromServer = action?.type === "success" && action.manual !== true;
    if (k0 === "beta-raid-map") {
      verifyDraft(qc, onNote);
      onSync();
      // Снимок целиком (дельта «full», сверка раз в минуту) кладут вручную, и
      // черновика на нём нет: «убрал — а постройка вернулась». Метка draftCells
      // пропала, очередь цела — кладём её обратно; своя запись метку несёт.
      const lost = action?.type === "success" && !mapOf(qc)?.draftCells;
      if (fromServer) resnapshot(qc);
      if (fromServer || (lost && Object.keys(draft.queue).length > 0)) applyDraft(qc);
      return;
    }
    if (writing) return;
    if (fromServer) resnapshotDefeated(qc);
    applyDefeated(qc, Object.values(draft.queue));
  });
}
