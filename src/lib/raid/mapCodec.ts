// Двоичный снимок карты рейда: то же содержимое, что у ответа getBetaRaidMap,
// но семь числовых колонок клеток лежат подряд как Int16, а не как текст.
//
// Зачем. Карта из 82 172 клеток в JSON через seroval весила 8,9 МБ и
// разбиралась на телефоне 300–600 мс на КАЖДУЮ перекачку. Здесь колонки
// читаются из буфера без разбора (Int16Array — это просто «вид» на байты),
// а разбирается только маленький JSON-заголовок со словарями и списками.
// Замер на живой карте: 1 245 КБ (262 КБ zstd), разбор 8 мс (CPU ×4), сборка
// на сервере 4 мс. Общий для сервера (кодирует), клиента (декодирует) и
// кэша на устройстве (кладётся в IndexedDB как есть).
//
// Раскладка: [magic "GDM1"][u32 длина заголовка][JSON-заголовок][паддинг до
// чётного][Int16: q, r, t, road, obj, dec, bld — по n чисел каждая].
export const MAP_BLOB_MAGIC = "GDM1";
/** Номер формата: чужой формат в кэше устройства отбрасывается. */
export const MAP_BLOB_FORMAT = 1;

/** Числовые колонки клеток — в порядке раскладки в буфере. */
export const MAP_COLUMNS = ["q", "r", "t", "road", "obj", "dec", "bld"] as const;
export type MapColumn = (typeof MAP_COLUMNS)[number];

/** Колонка клеток: с сервера приходит Int16Array, после правки кистью — number[]. */
export type Column = number[] | Int16Array;

/** Заголовок снимка — всё, кроме самих колонок. */
export type MapBlobHeader = {
  format: number;
  n: number;
  /** Версия карты (raid_maps.revision), на которой собран снимок. */
  revision: number;
  /** «player» — клетки под глухим туманом пустые; «admin» — целиком. */
  variant: "player" | "admin";
  /** main — главный мир (там замок); старый снимок поля не знает. */
  map: { id: string; name: string; size: number; main?: boolean } | null;
  dicts: {
    terrainIds: string[];
    roadIds: string[];
    objectIds: string[];
    decorationIds: string[];
    buildingIds: string[];
    /** Блоки объединённых клеток (режим бога). Старый снимок в кэше — без поля. */
    groupIds?: string[];
  };
  lists: {
    defeated: number[];
    runners: number[];
    voidFog: number[];
    townHalls: number[];
    /** Клетки с шахтой — сквозь них не пройти (packCells). Старый снимок — без поля. */
    mines?: number[];
    /**
     * Жилы: тройки (клетка, вид 1 — золото / 2 — алмазы, поворот 0..5 × 60°),
     * packCells. Старый снимок или база без таблицы жил — без поля.
     */
    veins?: number[];
    /** Тройки (клетка, индекс блока в groupIds, масштаб %) — см. packCells. */
    groups?: number[];
  };
  terrains: Record<string, unknown>;
  objects: Record<string, unknown>;
  decorations: Record<string, unknown>;
  roads: Record<string, unknown>;
  buildings: Record<string, unknown>;
  buildingTiers: Record<string, number>;
  doors: string[];
};

export type MapColumns = Record<MapColumn, Int16Array>;

export type DecodedMapBlob = { header: MapBlobHeader; columns: MapColumns };

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** Собрать буфер из заголовка и колонок. Колонки — любые массивы чисел. */
export function encodeMapBlob(
  header: MapBlobHeader,
  columns: Record<MapColumn, ArrayLike<number>>,
): Uint8Array {
  const n = header.n;
  const head = textEncoder.encode(JSON.stringify(header));
  const bodyStart = alignEven(4 + 4 + head.length);
  const out = new Uint8Array(bodyStart + n * MAP_COLUMNS.length * 2);
  out.set(textEncoder.encode(MAP_BLOB_MAGIC), 0);
  new DataView(out.buffer).setUint32(4, head.length, true);
  out.set(head, 8);
  const body = new Int16Array(out.buffer, bodyStart, n * MAP_COLUMNS.length);
  for (let c = 0; c < MAP_COLUMNS.length; c++) {
    const src = columns[MAP_COLUMNS[c]];
    const off = c * n;
    for (let i = 0; i < n; i++) body[off + i] = src[i] ?? -1;
  }
  return out;
}

/**
 * Разобрать буфер. Колонки — виды на тот же буфер, без копирования: пока жив
 * буфер, живы и они. null — не наш формат (чужой кэш, битый ответ).
 */
export function decodeMapBlob(bytes: ArrayBuffer | Uint8Array): DecodedMapBlob | null {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.byteLength < 8) return null;
  if (textDecoder.decode(u8.subarray(0, 4)) !== MAP_BLOB_MAGIC) return null;
  const headLen = new DataView(u8.buffer, u8.byteOffset).getUint32(4, true);
  if (8 + headLen > u8.byteLength) return null;
  let header: MapBlobHeader;
  try {
    header = JSON.parse(textDecoder.decode(u8.subarray(8, 8 + headLen))) as MapBlobHeader;
  } catch {
    return null;
  }
  if (header.format !== MAP_BLOB_FORMAT || !Number.isFinite(header.n)) return null;
  const n = header.n;
  const bodyStart = alignEven(8 + headLen);
  if (bodyStart + n * MAP_COLUMNS.length * 2 > u8.byteLength) return null;
  // Int16Array требует чётного смещения от начала ArrayBuffer — буфер из fetch
  // и IndexedDB начинается с нуля, а паддинг держит чётность.
  const body = new Int16Array(u8.buffer, u8.byteOffset + bodyStart, n * MAP_COLUMNS.length);
  const columns = {} as MapColumns;
  for (let c = 0; c < MAP_COLUMNS.length; c++) {
    columns[MAP_COLUMNS[c]] = body.subarray(c * n, (c + 1) * n);
  }
  return { header, columns };
}

function alignEven(x: number): number {
  return x + (x % 2);
}
