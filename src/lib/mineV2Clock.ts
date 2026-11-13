// Шахта v2 в окне (ПРАВИЛА §8.59): запас сейчас, остаток до поломки словами и
// сломана ли уже. Сервер отдаёт снимок (MineV2View), окно тикает само — без
// перезапроса и без F5.
//
// Время — СЕРВЕРА: breakAt и lifeAt пишет сервер, а часы телефона бывают сбиты
// (как у «Забвения», hero/oblivionClock). Ушли на 10 минут вперёд — работающая
// шахта «ломалась» в окне на 10 минут раньше. Снимок несёт serverNow, запрос
// ставит свою метку clientAt (середина запроса); их разница — сдвиг часов.
import { mineBreakAfterSwitch, mineLifeNow, type MineMode } from "./mineV2";
import type { MineV2View } from "./mineExtra";

type Life = Pick<MineV2View, "mode" | "lifeLeft" | "lifeAt">;

/** Метки часов у снимка (мс): serverNow — ставит сервер, clientAt — запрос окна. */
export type MineClockStamps = { serverNow?: number; clientAt?: number };
export type MineV2Stamped = MineV2View & MineClockStamps;

/** Сейчас по часам сервера. Нет меток (ответ старой сборки) — часы телефона. */
export function mineServerNow(v2: MineClockStamps | null | undefined, deviceNow: number): number {
  const server = Number(v2?.serverNow);
  const client = Number(v2?.clientAt);
  if (!(server > 0) || !(client > 0) || !Number.isFinite(server + client)) return deviceNow;
  return deviceNow - (client - server);
}

/** Ответ окна постройки + наша метка получения у снимка шахты v2. */
export function stampMineV2<T extends { extra?: unknown }>(
  offer: T,
  sentAt: number,
  gotAt: number,
): T {
  const x = offer.extra;
  if (!x || typeof x !== "object") return offer;
  const { kind, v2 } = x as { kind?: unknown; v2?: unknown };
  if (kind !== "mine" || !v2 || typeof v2 !== "object") return offer;
  const clientAt = Math.round((sentAt + gotAt) / 2);
  return { ...offer, extra: { ...x, v2: { ...v2, clientAt } } };
}

/** Сломана к моменту now (часы сервера): сервер сказал или срок вышел. */
export function mineBrokenNow(v2: Pick<MineV2View, "broken" | "breakAt">, now: number): boolean {
  return v2.broken || now >= v2.breakAt;
}

/**
 * Режим починки из окна «сломана»: ничья по ответу сервера встаёт в базе;
 * срок вышел, а сервер ещё «работает» — режим прежний (своя не падает в базу).
 */
export function brokenRepairMode(v2: Pick<MineV2View, "broken" | "mode">): MineMode {
  return v2.broken ? "base" : v2.mode;
}

/**
 * Запас в процентах для полосы: вверх, чтобы до самой поломки было видно
 * «1 %», а не «0 %» у ещё работающей шахты.
 */
export function mineLifePct(v2: Life, now: number): number {
  const life = mineLifeNow({ mode: v2.mode, lifeLeft: v2.lifeLeft, lifeAt: v2.lifeAt }, now);
  return Math.min(100, Math.max(0, Math.ceil(life * 100 - 1e-9)));
}

/** Остаток до поломки: ключ словаря (mine2.left_*) и числа, всё вниз. */
export function mineLeftParts(ms: number): { key: string; params: Record<string, number> } {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(sec / 86_400);
  const h = Math.floor((sec % 86_400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return { key: "mine2.left_dh", params: { d, h } };
  if (h > 0) return { key: "mine2.left_hm", params: { h, m } };
  return { key: "mine2.left_ms", params: { m, s: sec % 60 } };
}

/** Сколько мс до поломки, если сейчас переключить режим (как SQL set_mode). */
export function mineLeftAfterSwitch(v2: Life, to: MineMode, now: number): number {
  return (
    mineBreakAfterSwitch({ mode: v2.mode, lifeLeft: v2.lifeLeft, lifeAt: v2.lifeAt }, to, now) - now
  );
}
