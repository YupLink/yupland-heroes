// Память тумана на устройстве — битами, а не списком строк.
//
// 78 тысяч ключей «q,r» в localStorage весили 0,8 МБ и стоили 10–25 мс на
// каждую запись (JSON.stringify + синхронный setItem). Биты по номерам
// клеток — 82 КБ в буфере, ~14 КБ в base64, запись — доли миллисекунды.
//
// Биты привязаны к сетке карты: подпись (число клеток и рамка) хранится
// рядом, и если карта изменилась (расширили), сохранённое не годится — тогда
// берём старый список ключей, если он ещё есть, а иначе сбрасываем метку
// «since» синхронизации, чтобы сервер отдал разведанное целиком.
import type { FogMask } from "./fogMask";
import type { MapStore } from "./mapStore";
import { cellOrderHash } from "@/lib/raid/cellOrder";
import { useAppStore } from "@/lib/store";

// Ключи — по аккаунту (кошелёк сессии) и карте: на общем устройстве второй
// аккаунт иначе получал бы чужие биты и чужую метку since — и не видел бы
// своего разведанного, пока сервер не переспросят целиком.
const who = () => useAppStore.getState().walletAddress || "anon";
const bitsKey = (mapId: string) => `beta-raid-fogbits:${who()}:${mapId}`;
/** Что из разведанного точно доехало до сервера — свои биты, пишутся после удачной отправки. */
const pushedKey = (mapId: string) => `beta-raid-fogpushed:${who()}:${mapId}`;
const legacyKey = (mapId: string) => `beta-raid-fog:${mapId}`;
export const sinceKey = (mapId: string) => `beta-raid-fog-since:${who()}:${mapId}`;

/**
 * Подпись сетки: число клеток, рамка И порядок клеток (хэш колонок q/r).
 * Биты лежат по номерам клеток — сменился порядок (другая сборка снимка,
 * другая сортировка на сервере), и те же биты легли бы на чужие клетки:
 * 19.09 у игроков «узор» по всей карте и потерянное разведанное. Подпись
 * без порядка этого не ловила.
 */
export function signature(store: MapStore): string {
  const g = store.geom;
  return `${store.n}:${g.minQ}:${g.minR}:${g.cols}:${g.rows}:${orderOf(store)}`;
}

/** Подпись порядка клеток — та же, что считает сервер для снимка. */
export function orderOf(store: MapStore): string {
  return cellOrderHash(store.packed.q, store.packed.r, store.n);
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  }
  return btoa(s);
}

/** Прочитать сохранённое в маску. */
export function loadFogBits(mapId: string, store: MapStore, mask: FogMask): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(bitsKey(mapId));
    if (raw) {
      const { sig, bits } = JSON.parse(raw) as { sig: string; bits: string };
      if (sig === signature(store)) {
        const packed = fromBase64(bits);
        for (let i = 0; i < store.n; i++) {
          if (packed[i >> 3] & (1 << (i & 7))) mask.addIndex(i);
        }
        return;
      }
    }
    // Сетка другая или битов нет: локальной памяти верить нельзя — пусть
    // сервер отдаст разведанное целиком (он источник правды), а старые биты
    // затираем, чтобы они не пережили ещё одну смену сетки.
    window.localStorage.removeItem(sinceKey(mapId));
    if (raw) window.localStorage.removeItem(bitsKey(mapId));
    // Старый список ключей (до битов), если сохранился, — по координатам.
    const legacy = window.localStorage.getItem(legacyKey(mapId));
    if (legacy) {
      const arr = JSON.parse(legacy) as unknown;
      if (Array.isArray(arr)) mask.addMany(arr.map(String));
      window.localStorage.removeItem(legacyKey(mapId));
    }
  } catch {
    /* нет localStorage — играем с пустой памятью, сервер дольёт */
  }
}

/** Записать маску битами. */
export function saveFogBits(mapId: string, store: MapStore, mask: FogMask): void {
  writeBits(bitsKey(mapId), store, mask);
}

/**
 * Отправленное серверу — отдельными битами. Раньше «отправлено» выводилось
 * из разведанного: клетки, не доехавшие до сервера (нет сети), считались
 * доставленными навсегда. Читается той же подписью, что и разведанное.
 */
export function savePushedBits(mapId: string, mask: FogMask): void {
  writeBits(pushedKey(mapId), mask.store, mask);
}

export function loadPushedBits(mapId: string, store: MapStore, mask: FogMask): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(pushedKey(mapId));
    if (!raw) return;
    const { sig, bits } = JSON.parse(raw) as { sig: string; bits: string };
    if (sig === signature(store)) mask.addBits(fromBase64(bits));
    else window.localStorage.removeItem(pushedKey(mapId));
  } catch {
    /* нет памяти — отправим заново, сервер отбросит повторы */
  }
}

function writeBits(key: string, store: MapStore, mask: FogMask): void {
  if (typeof window === "undefined") return;
  try {
    const packed = new Uint8Array((store.n + 7) >> 3);
    for (let i = 0; i < store.n; i++) if (mask.rawIndex(i)) packed[i >> 3] |= 1 << (i & 7);
    window.localStorage.setItem(
      key,
      JSON.stringify({ sig: signature(store), bits: toBase64(packed) }),
    );
  } catch {
    /* переполнено — не критично, сервер помнит */
  }
}

/** Забыть разведанное карты на устройстве целиком: сервер его сбросил. */
export function forgetFog(mapId: string): void {
  try {
    for (const k of [bitsKey(mapId), pushedKey(mapId), sinceKey(mapId)]) {
      window.localStorage.removeItem(k);
    }
  } catch {
    /* без localStorage и забывать нечего */
  }
}
