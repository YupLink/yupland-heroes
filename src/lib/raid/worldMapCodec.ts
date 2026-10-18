// Карта мира: формат ответа сервера и упаковка местности «бегами».
//
// Клеток на карте за сотню тысяч, и списком объектов это мегабайты. Здесь
// местность едет сеткой по рамке карты (строка r, внутри строки q), а сетка —
// бегами «значение, длина»: океан и материки тянутся сотнями клеток подряд, и
// вся «Мир Альфа» (109 128 клеток) укладывается в 16 тысяч бегов. Бега идут
// varint-байтами в base64 — 43 КБ против 71 КБ тех же чисел в JSON (замер
// 04.10.2026).
//
// Общий модуль: сервер пакует (world-map-pack.ts), телефон разворачивает.

export type WorldMapMode = "seen" | "all";

/**
 * Что отмечено на карте мира: постройки — каждая по своему поведению
 * (cellBuildingEffect; лавка — market, город — town_hall, без поведения —
 * «прочие») — и мои клады: где закопано моё (мешочки, обычные и магические
 * сундуки; чужих в ответе нет). Мобов, боссов, артефактов, стоящих сундуков и
 * мешочков на земле здесь нет по построению. Номер вида едет в ответе: новый
 * вид — только в конец, старый клиент неизвестный номер пропускает
 * (worldMapModel).
 */
export const WORLD_MARK_KINDS = [
  "mine",
  "shop",
  "town",
  "treasure",
  // 05.10.2026 — все остальные поведения построек и «прочие».
  "field",
  "warehouse",
  "portal",
  "tavern",
  "watchtower",
  "shipyard",
  "university",
  "museum",
  "chambers",
  "tournament",
  "boost",
  "spellbook",
  "oblivion",
  "leveltree",
  "sign",
  "other",
] as const;
export type WorldMarkKind = (typeof WORLD_MARK_KINDS)[number];

export type WorldMapTerrain = { id: string; name: string; img: string | null };

export type WorldMapWire = {
  mode: WorldMapMode;
  /** Рамка в осевых координатах: столбцы q0…q0+cols−1, строки r0…r0+rows−1. */
  q0: number;
  r0: number;
  cols: number;
  rows: number;
  /** Словарь местности: значение в сетке = номер в словаре + 1, 0 — пусто. */
  terrains: WorldMapTerrain[];
  /** Сетка бегами (значение, длина), varint-байтами в base64. */
  runs: string;
  /**
   * Метки плоско тройками: номер вида в WORLD_MARK_KINDS, q, r. Постройки — на
   * показанных клетках (блок режима бога — одной меткой), клады — где угодно
   * (свои, игрок знает, где закопал).
   */
  marks: number[];
};

/** Самое большое значение клетки: сетка на клиенте — Uint16Array. */
const MAX_VALUE = 0xffff;

/** Сетка → бега varint-байтами в base64. */
export function encodeRuns(grid: ArrayLike<number>): string {
  const bytes: number[] = [];
  const put = (n: number) => {
    let v = n;
    while (v >= 0x80) {
      bytes.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    bytes.push(v);
  };
  let i = 0;
  while (i < grid.length) {
    const v = grid[i];
    let j = i + 1;
    while (j < grid.length && grid[j] === v) j++;
    put(v);
    put(j - i);
    i = j;
  }
  return toBase64(bytes);
}

/**
 * Бега → сетка заданного размера. null — данные не сходятся с размером:
 * лучше пустая карта, чем местность, съехавшая на чужие клетки.
 */
export function decodeRuns(b64: string, size: number): Uint16Array | null {
  const bytes = fromBase64(b64);
  if (!bytes) return null;
  const grid = new Uint16Array(size);
  let pos = 0;
  let at = 0;
  const get = (): number => {
    let n = 0;
    let mul = 1;
    for (;;) {
      if (pos >= bytes.length) return -1;
      const b = bytes[pos++];
      n += (b & 0x7f) * mul;
      if (!(b & 0x80)) return n;
      mul *= 128;
      if (mul > 2 ** 35) return -1;
    }
  };
  while (pos < bytes.length) {
    const v = get();
    const len = get();
    if (v < 0 || v > MAX_VALUE || len <= 0 || at + len > size) return null;
    if (v) grid.fill(v, at, at + len);
    at += len;
  }
  return at === size ? grid : null;
}

function toBase64(bytes: number[]): string {
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.slice(i, i + CHUNK));
  }
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array | null {
  let s: string;
  try {
    s = atob(b64);
  } catch {
    return null;
  }
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
