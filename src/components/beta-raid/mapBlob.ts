// Карта из двоичного снимка (lib/raid/mapCodec) — в форму, которой живёт экран.
//
// Форма та же, что раньше отдавал getBetaRaidMap: словари, packed с колонками
// и списками, постройки, тиры, двери. Разница одна: колонки клеток — это
// Int16Array-виды на буфер ответа, без копирования и без разбора. Всё, что
// ниже по течению (unpackCells, patchMapCache, редактор), индексирует их как
// обычные массивы; правка кистью клонирует колонку в number[] (packedEdit).
import { decodeMapBlob, MAP_COLUMNS } from "@/lib/raid/mapCodec";
import type { MapData } from "./useBetaRaidData";
import type { PackedCells } from "./unpackMap";

export type MapDataV = MapData & {
  revision: number;
  mapId: string;
  /** Чей это снимок: игроку под куполом пусто, админу — всё. */
  variant?: "player" | "admin";
};

export function mapFromBlob(bytes: ArrayBuffer): MapDataV | null {
  const decoded = decodeMapBlob(bytes);
  if (!decoded) return null;
  const { header: h, columns } = decoded;
  const packed = {
    ...h.dicts,
    ...h.lists,
  } as unknown as PackedCells;
  for (const c of MAP_COLUMNS) (packed as unknown as Record<string, unknown>)[c] = columns[c];
  return {
    map: h.map,
    terrains: h.terrains as MapData["terrains"],
    objects: h.objects as MapData["objects"],
    decorations: h.decorations as MapData["decorations"],
    roads: h.roads as MapData["roads"],
    packed,
    buildings: h.buildings as MapData["buildings"],
    buildingTiers: h.buildingTiers,
    doors: h.doors,
    scope: "full",
    revision: h.revision,
    mapId: h.map?.id ?? "",
    variant: h.variant,
  };
}

/**
 * В снимке есть список шахт (lists.mines, сборка g3+; пустой массив — тоже
 * список). Поля нет вовсе — снимок старой сборки: при раскатке ответил ещё не
 * сменённый рабочий или браузер дополнил 304 своим кэшем. Такой снимок водил
 * бы героя сквозь шахты — в кэш устройства его не кладём (useMapProgressive).
 */
export const hasMinesList = (data: MapDataV): boolean => Array.isArray(data.packed?.mines);

/**
 * В снимке есть список жил (lists.veins, сборка g4+; пустой — тоже список).
 * Нет — старая сборка или база ещё без таблицы жил (server vein-cells).
 */
export const hasVeinsList = (data: MapDataV): boolean => Array.isArray(data.packed?.veins);

/** Снимок нынешней сборки: только такой кладём в кэш устройства и берём из него. */
export const isCurrentBuild = (data: MapDataV): boolean => hasMinesList(data) && hasVeinsList(data);

/**
 * Снимок с сервера: тело + версия из заголовка. 304 — «у тебя актуальная».
 * fresh — мимо HTTP-кэша браузера: без своего If-None-Match и без подмены 304
 * телом из кэша (повтор за снимком старой сборки).
 */
export async function fetchMapBlob(
  etag?: string | null,
  opts?: { fresh?: boolean },
): Promise<
  | { status: "fresh"; bytes: ArrayBuffer; revision: number }
  | { status: "same" }
  | { status: "error"; code: number }
> {
  const res = await fetch("/api/beta-raid/map-blob", {
    headers: etag ? { "if-none-match": etag } : {},
    credentials: "same-origin",
    ...(opts?.fresh ? { cache: "no-store" as const } : {}),
  });
  if (res.status === 304) return { status: "same" };
  if (!res.ok) return { status: "error", code: res.status };
  const bytes = await res.arrayBuffer();
  const revision = Number(res.headers.get("x-map-revision") ?? 0) || 0;
  return { status: "fresh", bytes, revision };
}
