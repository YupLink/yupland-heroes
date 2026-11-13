// Карта приезжает один раз на версию — дальше живёт дельтами.
//
// Порядок входа: (1) снимок из IndexedDB — карта на экране сразу; (2) журнал
// с сохранённой версии (/api/beta-raid/map-delta?rev=N) — накладываем
// правки; если журнал говорит «бери снимок» или кэша нет — (3) двоичный
// снимок целиком (/api/beta-raid/map-blob, 262 КБ по проводу, 8 мс разбора).
// Дальше изменения приходят живым каналом (useRaidLiveStream, событие «map»)
// и накладываются на месте; раз в минуту версия сверяется с сервером, чтобы
// пропущенное событие не оставило карту устаревшей.
//
// Ключ кэша прежний (['beta-raid-map']): туман, черновик админа и точечные
// правки завязаны на него. staleTime бесконечный: перечитывать карту по
// таймеру больше незачем — у неё есть версия.
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { applyCellPatches } from "./patchMapCache";
import { fetchMapBlob, isCurrentBuild, mapFromBlob, type MapDataV } from "./mapBlob";
import { readCachedMap, writeCachedMap } from "./mapCache";
import { useAppStore } from "@/lib/store";
import type { MapDelta } from "@/lib/raid/mapDelta";

export const MAP_KEY = ["beta-raid-map"] as const;
const CHECK_EVERY_MS = 60_000;

/**
 * У карты есть версия. Ноль — тоже версия: новая карта (остров новичка,
 * свежий этаж) начинается с 0, а проверка «!revision» считала её картой «без
 * версии». Тогда дельты не накладывались вовсе, а перечитка после «Забрать»
 * подменяла карту снимком из кэша устройства — забранный сундук возвращался
 * и не давал себя взять («Объект не найден»; владелец, 15.10.2026).
 */
export const hasRevision = (d: { revision?: unknown } | null | undefined): boolean =>
  typeof d?.revision === "number" && Number.isFinite(d.revision);

async function fetchDelta(rev: number): Promise<(MapDelta & { mapId?: string }) | null> {
  const res = await fetch(`/api/beta-raid/map-delta?rev=${Math.floor(rev)}`, {
    credentials: "same-origin",
  });
  if (!res.ok) return null;
  return (await res.json()) as MapDelta & { mapId?: string };
}

/** Пауза перед повтором за снимком: при раскатке старый рабочий успевает смениться. */
export const STALE_BLOB_RETRY_MS = 1500;

type FullBlob = { data: MapDataV; bytes: ArrayBuffer };

async function fetchFull(fresh: boolean): Promise<FullBlob> {
  const got = await fetchMapBlob(null, { fresh });
  if (got.status !== "fresh")
    throw new Error(`map blob ${got.status === "error" ? got.code : "?"}`);
  const data = mapFromBlob(got.bytes);
  if (!data) throw new Error("map blob: bad format");
  return { data, bytes: got.bytes };
}

/**
 * Снимок старой сборки (без списка шахт или жил — isCurrentBuild): при
 * раскатке ответил ещё не сменённый рабочий. Разок переспрашиваем мимо
 * HTTP-кэша; опять старый (или повтор упал) — живём им эту сессию, но в кэш
 * устройства не кладём, иначе под ключом g4 он прожил бы до ближайшего «full»
 * журнала. Обычный вход — без лишнего запроса.
 */
async function currentBuild(first: FullBlob): Promise<{ got: FullBlob; save: boolean }> {
  if (isCurrentBuild(first.data)) return { got: first, save: true };
  await new Promise((res) => setTimeout(res, STALE_BLOB_RETRY_MS));
  const again = await fetchFull(true).catch(() => null);
  if (!again) return { got: first, save: false };
  return { got: again, save: isCurrentBuild(again.data) };
}

/** Снимок целиком: с сервера, в кэш устройства, в форму экрана. */
export async function loadFull(): Promise<MapDataV> {
  const { got, save } = await currentBuild(await fetchFull(false));
  if (!save) return got.data;
  // Ключ — «последняя карта» ЭТОГО аккаунта: у игрока одна активная карта, а
  // на общем устройстве после админа входит игрок — снимок админа (с
  // содержимым под куполом) ему доставаться не должен. Без аккаунта не пишем.
  const who = cacheOwner();
  if (who) {
    void writeCachedMap({
      mapId: "last",
      variant: who,
      revision: got.data.revision,
      bytes: got.bytes,
      at: Date.now(),
    });
  }
  return got.data;
}

/** Кому принадлежит кэш устройства: кошелёк сессии; нет — кэш не используем. */
function cacheOwner(): string | null {
  return useAppStore.getState().walletAddress || null;
}

/**
 * Снимок из кэша годится этой сессии: не админский, если сессия не админ, и
 * нынешней сборки — без списков шахт и жил он туда попасть не должен (loadFull).
 */
export function cacheFits(data: MapDataV, isAdmin: boolean | undefined): boolean {
  if (!isCurrentBuild(data)) return false;
  if (data.variant === "admin") return isAdmin === true;
  return true;
}

/** Наложить дельту на карту в кэше; «бери снимок» — вернуть false. */
function applyDelta(old: MapDataV, delta: MapDelta): MapDataV | false {
  if (delta.full) return false;
  if (delta.patches.length === 0) return { ...old, revision: Math.max(old.revision, delta.rev) };
  const next = applyCellPatches(old, delta.patches, undefined, delta.assets) as
    | MapDataV
    | undefined;
  return { ...(next ?? old), revision: Math.max(old.revision, delta.rev) };
}

/**
 * Как положить ответ сервера в кэш: функцией от того, что в кэше лежит СЕЙЧАС.
 *
 * Журнал и снимок ждут сеть, а за это время в кэш ложатся побеги и добитые
 * (applyFled, applyDefeated — без версии). Карта, снятая ДО ожидания и
 * положенная ПОСЛЕ, стирала их: гриб возвращался на старую клетку на каждый
 * удар (invalidateRaidMap → queryFn → catchUp) и раз в минуту — до следующей
 * дельты «map», то есть «исчезал на несколько секунд». Патчи журнала —
 * правда и идемпотентны, их можно класть поверх чего угодно.
 */
export type MapMerge = (latest: MapDataV | undefined) => MapDataV | undefined;

/** undefined — оставить как есть: setQueryData такое не трогает и никого не будит. */
const keep: MapMerge = () => undefined;
const replace =
  (data: MapDataV): MapMerge =>
  () =>
    data;
const mergeDelta =
  (delta: MapDelta): MapMerge =>
  (latest) => {
    if (!latest || !hasRevision(latest) || delta.rev <= latest.revision) return undefined;
    const next = applyDelta(latest, delta);
    return next === false ? undefined : next;
  };

/** Догнать сервер с версии карты в кэше. */
export async function catchUp(old: MapDataV): Promise<MapMerge> {
  const delta = await fetchDelta(old.revision);
  if (!delta) return keep;
  // Игрок на другой карте (мультикарта) — кэш с прежней не годится.
  if (delta.mapId && old.mapId && delta.mapId !== old.mapId) return replace(await loadFull());
  if (delta.full) return replace(await loadFull());
  return mergeDelta(delta);
}

/** Дельта из живого канала: наложить, если версия следующая; иначе догнать журналом. */
export async function applyLiveDelta(
  cur: MapDataV,
  delta: MapDelta & { mapId?: string },
): Promise<MapMerge> {
  if (delta.mapId && cur.mapId && delta.mapId !== cur.mapId) return keep;
  if (delta.rev <= cur.revision) return keep;
  // Пропустили событие (версии не подряд) — журнал отдаст всё разом.
  if (delta.full || !("patches" in delta) || !delta.patches || delta.rev !== cur.revision + 1)
    return catchUp(cur);
  return mergeDelta(delta);
}

export function useMapProgressive() {
  const qc = useQueryClient();
  const mapQ = useQuery({
    queryKey: MAP_KEY,
    queryFn: async (): Promise<MapDataV> => {
      // Уже есть в памяти (перечитка по invalidate) — только догоняем, и
      // кладём поверх того, что в кэше ПОСЛЕ ожидания сети (MapMerge).
      const have = qc.getQueryData<MapDataV>(MAP_KEY);
      if (have?.packed && hasRevision(have)) {
        const merge = await catchUp(have);
        const latest = qc.getQueryData<MapDataV>(MAP_KEY) ?? have;
        return merge(latest) ?? latest;
      }
      // Кэш устройства: последняя сохранённая карта этого аккаунта, версия
      // сверяется журналом.
      const who = cacheOwner();
      const cached = who ? await readCachedMap("last", who) : null;
      if (cached) {
        const data = mapFromBlob(cached.bytes);
        const session = qc.getQueryData<{ isAdmin?: boolean }>(["session"]);
        if (data && cacheFits(data, session?.isAdmin)) return (await catchUp(data))(data) ?? data;
      }
      return loadFull();
    },
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    // Без структурного разделения: см. lib/query.ts (колонки по 82 тыс. чисел).
    structuralSharing: false,
  });

  // Карта без версии (восстановлена из чужого/старого кэша) — не наша:
  // перечитать сразу, иначе она осталась бы «свежей» навсегда.
  useEffect(() => {
    const cur = qc.getQueryData<MapDataV>(MAP_KEY);
    if (cur && !hasRevision(cur)) void qc.invalidateQueries({ queryKey: MAP_KEY });
  }, [qc]);

  // Раз в минуту — сверка версии: пропущенное событие догоняем журналом.
  const busy = useRef(false);
  useEffect(() => {
    const id = setInterval(async () => {
      if (busy.current || document.visibilityState === "hidden") return;
      const cur = qc.getQueryData<MapDataV>(MAP_KEY);
      if (!cur || !hasRevision(cur)) return;
      busy.current = true;
      try {
        const merge = await catchUp(cur);
        qc.setQueryData(MAP_KEY, (latest?: MapDataV) => merge(latest ?? cur));
      } catch {
        /* нет сети — следующая минута */
      } finally {
        busy.current = false;
      }
    }, CHECK_EVERY_MS);
    return () => clearInterval(id);
  }, [qc]);

  return mapQ;
}
