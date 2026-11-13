// Цена генерации растёт с каждым заказом подряд (Ярослав 11.11.2026: «1 стандарт
// цена, 2 +25 %, 3 +50 %, 4 +100 %, 5 +200 % — макс в день на акк 5 арт»; владелец:
// делать, «сутки считаются с момента последнего крафта»). Заказы идут цепочкой,
// пока между соседними меньше суток; сутки после последнего — цепочка с нуля.
// Пятый в цепочке — последний: шестой можно через сутки после пятого. Считаются
// оплаченные заказы (в работе и готовые); не вышедшие возвращают цену и не в счёт.
// Одна функция и окну (цена на кнопке), и серверу (что списать).
import type { PortalPrice } from "@/lib/portal";

/** Надбавка к цене 1-го…5-го заказа подряд, %. */
export const STEP_MARKUP = [0, 25, 50, 100, 200] as const;
export const STEP_MAX = STEP_MARKUP.length;
export const STEP_WINDOW_MS = 24 * 60 * 60 * 1000;

export type GenStep = {
  /** Какой по счёту будет следующий заказ (1…5); null — предел, ждать resetAt. */
  step: number | null;
  /** Когда цепочка начнётся с нуля (сутки после последнего заказа); нет заказов — null. */
  resetAt: number | null;
};

/** times — моменты оплаченных заказов аккаунта (мс), любые; хватает последних пяти. */
export function nextStep(times: readonly number[], now: number): GenStep {
  const t = [...times].sort((a, b) => b - a);
  if (t.length === 0 || now - t[0] >= STEP_WINDOW_MS) return { step: 1, resetAt: null };
  let chain = 1;
  while (chain < t.length && chain < STEP_MAX && t[chain - 1] - t[chain] < STEP_WINDOW_MS) chain++;
  const resetAt = t[0] + STEP_WINDOW_MS;
  return { step: chain >= STEP_MAX ? null : chain + 1, resetAt };
}

/** Цена заказа с надбавкой; целые (золото, алмазы) — до ближайшего целого, не ниже исходной. */
export function stepPrice(price: readonly PortalPrice[], step: number): PortalPrice[] {
  const pct = 100 + (STEP_MARKUP[step - 1] ?? 0);
  if (pct === 100) return price.map((p) => ({ ...p }));
  return price.map((p) => {
    const v = (p.amount * pct) / 100;
    const amount = Number.isInteger(p.amount) ? Math.round(v) : Math.round(v * 1e6) / 1e6;
    return { ...p, amount: Math.max(p.amount, amount) };
  });
}
