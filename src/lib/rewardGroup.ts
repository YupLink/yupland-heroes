// Группа наград очереди: «один и тот же предмет / ресурс / токен / пак».
//
// Окно «Добыча» получает очередь ПО ЦЕЛЯМ («Зимний Йети — лайки 25, Хлеб 2»),
// а игрок хочет забирать ПО ТИПАМ: «весь Хлеб сразу», «все лайки». Ключ
// группы один и тот же на сервере (фильтр клейма) и на клиенте (строка
// списка), поэтому живёт здесь, а не inline в двух местах, как раньше.
//
// Клиентский модуль: серверных импортов здесь быть не должно.
import { soonestExpiry } from "@/lib/rewardExpiry";

/** Минимум, по которому награда узнаётся в группе; остальные поля — как есть. */
export type RewardLike = {
  kind: string;
  packId: string | null;
  amount: number;
  count: number;
  /** Ближайшее сгорание в группе (мс эпохи); null/нет — бессрочные. */
  expiresAt?: number | null;
};

/**
 * Ключ группы. pack_id у лайков, энергии, билетов и токенов — NULL, поэтому
 * пустая ссылка — тоже часть ключа («likes:»), а не отсутствие ключа.
 */
export const rewardGroupKey = (kind: string, packId: string | null | undefined): string =>
  `${kind}:${packId ?? ""}`;

/**
 * Штучные виды показываем «×N» (пак, артефакт), остальное — суммой: у своего
 * товара и токенов суммы дробные (0,79 Огурцов), «×3» там врал бы.
 */
export const isPieceKind = (kind: string): boolean => kind === "pack" || kind === "item";

/** Виды, которые оседают в игре; всё прочее — символ токена (Darai, USDT). */
const IN_GAME = new Set([
  "likes",
  "energy",
  "tickets",
  "pack",
  "item",
  "resource",
  "custom",
  "gold",
  "stone",
  "wood",
  "diamonds",
]);

/**
 * Токен не зачисляется на счёт, а становится заявкой в «Выплатах» — в окне
 * это подписываем, чтобы «забрано» без видимого баланса не читалось потерей.
 */
export const isTokenKind = (kind: string): boolean => !IN_GAME.has(kind);

/**
 * Склеить награды всех целей в список по типам: сумма количества и число
 * наград в группе, срок — ближайший. Первое вхождение задаёт имя и картинку.
 * Крупные группы сверху: за «забрать всё одного типа» приходят ради них, а не
 * ради «×1».
 */
export function groupPendingRewards<T extends RewardLike>(
  sources: ReadonlyArray<{ rewards: ReadonlyArray<T> }>,
): T[] {
  const byKey = new Map<string, T>();
  for (const s of sources) {
    for (const r of s.rewards) {
      const key = rewardGroupKey(r.kind, r.packId);
      const same = byKey.get(key);
      if (same) {
        same.amount += r.amount;
        same.count += r.count;
        if (same.expiresAt != null || r.expiresAt != null) {
          same.expiresAt = soonestExpiry(same.expiresAt, r.expiresAt);
        }
      } else {
        byKey.set(key, { ...r });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || b.amount - a.amount);
}
