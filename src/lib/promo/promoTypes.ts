// Промокоды на что угодно (владелец, 28–29.10.2026): общие типы сервера,
// админки и профиля. Клиентский модуль — серверных импортов здесь нет.
//
// Виды — те же, что выдаёт подарок (gifts-deliver), плюс босс (стопка
// boss:<шаблон> в рюкзак). Билетов нет (§8.61), «предмет» без вида — тоже:
// у героя и артефакта свои кнопки.

export const PROMO_KINDS = [
  "token",
  "resource",
  "likes",
  "energy",
  "custom",
  "pack",
  "art",
  "hero",
  "boss",
  "nothing",
] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];

/**
 * «Ничего» (владелец, 05.11.2026): промокод выдаёт ОДИН приз по весам строк, и
 * «ничего» — такая же строка со своим весом. Ссылки, количества и объёма нет.
 */
export const isPromoNothing = (k: PromoKind): boolean => k === "nothing";

/** Права promo_soft (не админ): только эти виды (владелец, 04.11.2026) и «Ничего». */
export const PROMO_SOFT_KINDS: readonly PromoKind[] = ["energy", "likes", "nothing"];

export const isPromoKind = (v: unknown): v is PromoKind =>
  typeof v === "string" && (PROMO_KINDS as readonly string[]).includes(v);

/**
 * Куда легло выпавшее: на счёт (монеты, ресурсы, лайки, энергия), в рюкзак
 * выбранного героя (товар, босс), в инвентарь (боксы, герои, артефакты — туда
 * же, куда их кладёт подарок), в «Добычу» (места или героя нет). pending — не
 * доехало ни туда, ни в «Добычу» (сбой базы): доедет повторным вводом кода.
 */
export type PromoWhere = "balance" | "backpack" | "inventory" | "harvest" | "pending";

/** Одна выпавшая строка для карточки игрока. */
export type PromoGot = {
  kind: PromoKind;
  /** Символ токена, код ресурса, id справочника; у лайков и энергии — null. */
  ref: string | null;
  name: string | null;
  image: string | null;
  amount: number;
  where: PromoWhere;
};

/** Ответ ввода: not_found — кода нет среди новых, профиль спросит коды на лайки. */
export type PromoRedeemResult =
  | { status: "ok"; code: string; items: PromoGot[] }
  | { status: "not_found" };

/** Виды со ссылкой: символ токена, код ресурса, id справочника. */
const NEEDS_REF: ReadonlySet<PromoKind> = new Set([
  "token",
  "resource",
  "custom",
  "pack",
  "art",
  "hero",
  "boss",
]);
export const promoNeedsRef = (k: PromoKind): boolean => NEEDS_REF.has(k);

/** Штучное: «×N» в карточке; паки, герои, артефакты, товар и босс — не больше 100 за ввод. */
const PIECE: ReadonlySet<PromoKind> = new Set(["pack", "art", "hero", "boss", "custom"]);
export const isPromoPiece = (k: PromoKind): boolean => PIECE.has(k);

export const PROMO_MAX_PIECES = 100;
export const PROMO_MAX_AMOUNT = 1_000_000_000;
export const promoMaxAmount = (k: PromoKind): number =>
  PIECE.has(k) ? PROMO_MAX_PIECES : PROMO_MAX_AMOUNT;

/**
 * Токен (DARAI и прочие) — прямое начисление на счёт, как у казначейства:
 * заводит только владелец (requirePayoutsAdmin), и объём строки обязателен.
 */
export const promoOwnerOnly = (k: PromoKind): boolean => k === "token";

export const PROMO_MAX_LINES = 12;
export const PROMO_MAX_USERS = 1_000_000;

/** Строка кода в админке: настройка и сколько уже выдано. */
export type PromoLineAdmin = {
  idx: number;
  kind: PromoKind;
  ref: string | null;
  title: string | null;
  image: string | null;
  min: number;
  max: number;
  /** Вес строки: доля среди строк кода — её шанс (promoShares). */
  chance: number;
  /** Объём строки за всё время; null — без предела. */
  budget: number | null;
  given: number;
};

export type PromoCodeAdmin = {
  id: string;
  code: string;
  active: boolean;
  maxUsers: number | null;
  usedUsers: number;
  createdAt: string;
  /** Кто завёл (кошелёк) — владельцу видно в списке. */
  createdBy: string | null;
  lines: PromoLineAdmin[];
};
