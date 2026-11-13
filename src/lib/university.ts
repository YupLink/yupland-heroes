// Университет: сколько фишки нафармят лайков и что даёт уровень здания.
//
// Общий модуль для сервера и клиента — числа в окне и числа при начислении
// обязаны совпадать до последнего знака, иначе игрок видит одно, а получает
// другое (так уже расходились цена шага и списание).
//
// УРОВНИ. Первый тир постройки — стройка, работать там нечему; уровни идут со
// второго. Тиры в базе нумеруются с нуля, поэтому уровень = номер тира: тир 0 —
// стройка (уровень 0, не работает), тир 1 — первый уровень, и так далее.
//
// ДОХОД. Первый уровень = текущая доходность фишки, дальше каждый уровень
// прибавляет 20% ОТ БАЗЫ (не от предыдущего): 1.0 / 1.2 / 1.4 / 1.6 …
// Множитель берётся у того здания, ГДЕ ИГРОК КЛЕЙМИТ, а не где положил фишки, —
// поэтому за высоким университетом и есть смысл идти.

// МЕСТА ПОД ОБУЧЕНИЕ. Учиться могут не все фишки разом: мест ограниченное
// число, часть открыта сразу, остальные докупаются по растущей цене.
// Формула — та же, что у слотов майнинга (chips-utils.slotUnlockPrice): шаг
// 25 билетов; билетов с 20.10.2026 нет (§8.61) — платится золотом ×500.
import { goldForTicketPrice } from "./ticketGold";

/** Открыто сразу, без вложений. */
export const UNI_FREE_SLOTS = 3;
/** Больше этого мест не бывает. */
export const UNI_MAX_SLOTS = 12;
/** Шаг цены места в золоте: 25 билетов × 500 — первое 12 500, второе 25 000, … */
export const UNI_SLOT_PRICE_STEP = goldForTicketPrice(25);

/** Цена СЛЕДУЮЩЕГО места в золоте при нынешнем их числе. null — расширять некуда. */
export function nextSlotPrice(slots: number): number | null {
  const have = Math.max(UNI_FREE_SLOTS, Math.floor(slots));
  if (have >= UNI_MAX_SLOTS) return null;
  const purchaseNo = have - UNI_FREE_SLOTS + 1;
  return UNI_SLOT_PRICE_STEP * purchaseNo;
}

// СБОР И ПОТОЛОК НАКОПЛЕНИЯ.
//
// Кулдаун 4 часа: игрок должен возвращаться к университету, а не подметать
// лайки нон-стоп. Потолок недели: если не заходил семь суток, дальше уже
// ничего не капает — свободное место, вернись и забери.
export const UNI_CLAIM_COOLDOWN_MS = 4 * 60 * 60 * 1000;
export const UNI_ACCRUAL_CAP_MS = 7 * 24 * 60 * 60 * 1000;

/** Уровень университета по номеру тира постройки. 0 — ещё стройка. */
export function universityLevel(tier: number): number {
  return Math.max(0, Math.floor(tier));
}

/** Прибавка за уровень сверх первого. */
export const UNIVERSITY_STEP = 0.2;

/**
 * Множитель дохода. 0 — университет ещё не построен и ничего не даёт.
 */
export function universityBonus(level: number): number {
  const lv = Math.max(0, Math.floor(level));
  return lv === 0 ? 0 : 1 + UNIVERSITY_STEP * (lv - 1);
}

/** «×1.4» для окна — без лишних нулей. */
export function bonusLabel(level: number): string {
  const b = universityBonus(level);
  return `×${b.toFixed(b % 1 === 0 ? 0 : 1)}`;
}

/**
 * Общий множитель дохода всех фишек. Прежние числа университета (5★ = 1/сут)
 * шли впритык к слотам майнинга, а на живой игре оказались скучными — за фишкой
 * приходилось стоять сутки за один лайк. Владелец повысил разом в шесть раз:
 * это то самое «первый уровень университета = текущая доходность», просто
 * доходность у механики теперь своя.
 */
export const CHIP_LIKE_MULT = 6;

/**
 * Сколько лайков в сутки приносит одна фишка этого уровня.
 *
 * База — та же кривая, что у слотов майнинга (chips-utils), домножается на
 * CHIP_LIKE_MULT. Пятизвёздочная теперь даёт 6 лайков в сутки на первом уровне
 * университета, дальше это число ещё увеличивается множителем здания.
 */
export function chipLikesPerDay(chipLevel: number): number {
  const n = Math.max(1, Math.min(9, Math.round(chipLevel * 2) - 1));
  return (CHIP_LIKE_MULT / Math.pow(2, 9 - n));
}

/** Сколько накопится за срок при такой ставке — с потолком в неделю. */
export function accruedCapped(ratePerDay: number, fromMs: number, toMs: number): number {
  const gap = Math.min(Math.max(0, toMs - fromMs), UNI_ACCRUAL_CAP_MS);
  return (ratePerDay * gap) / 86_400_000;
}

/** Сумма ставок набора фишек, лайков в сутки. */
export function stakeRatePerDay(levels: number[]): number {
  return levels.reduce((s, lv) => s + chipLikesPerDay(lv), 0);
}

/** Сколько накопится за срок при такой ставке. */
export function accrued(ratePerDay: number, fromMs: number, toMs: number): number {
  const days = Math.max(0, (toMs - fromMs) / 86_400_000);
  return ratePerDay * days;
}

/** Лайки показываем с двумя знаками: ставки мелкие, целые числа врали бы. */
export function likesLabel(v: number): string {
  return (Math.round(v * 100) / 100).toFixed(2);
}
