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

/** Снимок с сервера: тело + версия из заголовка. 304 — «у тебя актуальная». */
export async function fetchMapBlob(
  etag?: string | null,
): Promise<
  | { status: "fresh"; bytes: ArrayBuffer; revision: number }
  | { status: "same" }
  | { status: "error"; code: number }
> {
  const res = await fetch("/api/beta-raid/map-blob", {
    headers: etag ? { "if-none-match": etag } : {},
    credentials: "same-origin",
  });
  if (res.status === 304) return { status: "same" };
  if (!res.ok) return { status: "error", code: res.status };
  const bytes = await res.arrayBuffer();
  const revision = Number(res.headers.get("x-map-revision") ?? 0) || 0;
  return { status: "fresh", bytes, revision };
}
