// Кэш снимка карты на устройстве — IndexedDB.
//
// Двоичный буфер (1,2 МБ) кладётся как есть: запись и чтение — по ~14 мс
// (замер, CPU ×4). При следующем входе карта рисуется из кэша сразу, а по
// сети идёт только журнал с сохранённой версии. localStorage под это не
// годится: он текстовый и с лимитом ~5 МБ, а persist react-query карту
// больше не хранит (см. lib/query.ts).
//
// Любая ошибка (приватный режим Safari, чистка данных, нет API) — молча
// «кэша нет»: вход просто скачает снимок целиком, как раньше.
const DB = "gd-raid-map";
const STORE = "blob";
const VERSION = 1;

export type CachedMap = {
  mapId: string;
  variant: string;
  revision: number;
  bytes: ArrayBuffer;
  at: number;
};

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Поколение кэша. Дельты добавляют в словари карты только НОВЫЕ id — уже
 * известную запись не перепишут. Если в снимке ошибочная запись словаря (07.10:
 * облик ратуши без тиров → серый квадрат), исправленный сервер её игроку не
 * донесёт; новое поколение — разовая перекачка снимка у каждого (~80 КБ).
 * g3 (20.10): в снимке появился список шахт (packed.mines) — без перекачки
 * старый снимок без списка водил бы героя сквозь шахты, пока не перекачается.
 * g4 (21.10): в снимке жилы золота и алмазов (lists.veins) — старый снимок
 * без них не показал бы жилы до ближайшей перекачки.
 * g5 (21.10): жилы перерисованы гнёздами по 1–2 клетки (minev2-31) — версия
 * карты от этого не меняется, без нового поколения висели бы старые жилы.
 * g6 (23.10): новая картинка золотого гриба (облик bskin_dm_gold →
 * mushroom-gold-v3.webp) — запись словаря уже известна, дельта её не перепишет.
 */
const GEN = 6;
const keyOf = (mapId: string, variant: string) => `${mapId}:${variant}:g${GEN}`;
/** Прежние поколения: без суффикса (первое), g2, g3, g4 и g5. */
const legacyKeysOf = (mapId: string, variant: string) => [
  `${mapId}:${variant}`,
  `${mapId}:${variant}:g2`,
  `${mapId}:${variant}:g3`,
  `${mapId}:${variant}:g4`,
  `${mapId}:${variant}:g5`,
];

export async function readCachedMap(mapId: string, variant: string): Promise<CachedMap | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const get = tx.objectStore(STORE).get(keyOf(mapId, variant));
      get.onsuccess = () => {
        const v = get.result as CachedMap | undefined;
        resolve(v && v.bytes instanceof ArrayBuffer ? v : null);
      };
      get.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    } catch {
      resolve(null);
    }
  });
}

export async function writeCachedMap(entry: CachedMap): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.put(entry, keyOf(entry.mapId, entry.variant));
      // Прежнее поколение больше не читается — место не держим.
      for (const k of legacyKeysOf(entry.mapId, entry.variant)) store.delete(k);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
