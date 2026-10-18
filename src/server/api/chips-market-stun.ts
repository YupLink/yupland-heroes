// Оглушённую фишку нельзя выставить на продажу.
//
// Оглушение боссом (chip_effects kind='stun') — это «фишка без сознания»: она
// не выходит в бой, пока не отпустит. Продавать её всё это время было можно, и
// покупатель получал за билеты бойца, который проснётся неизвестно когда, —
// такой же обман, как продажа отдыхающей после передачи фишки (rest_until).
//
// Проверка живёт на СЕРВЕРЕ и зовётся из обеих ручек выставления (одиночной и
// пачкой): интерфейс можно обойти, ручку — нет.
//
// Уже выставленный лот, чью фишку потом оглушили, НЕ трогаем: снимать чужие
// лоты задним числом — отдельная механика, а покупателю оглушение всё равно
// достанется вместе с фишкой и истечёт само.

/** Ключ словаря: сервер бросает его, humanError/serverErrorText переведут. */
export const CHIP_STUNNED_KEY = "market.chip_stunned";
/** Тот же отказ, но со сроком — его показывает интерфейс, знающий минуты. */
export const CHIP_STUNNED_MIN_KEY = "market.chip_stunned_min";

/**
 * chipId → когда фишка очнётся. В карте только те, кто оглушён ПРЯМО СЕЙЧАС:
 * loadChipEffects истёкшие эффекты не возвращает.
 *
 * Импорт ленивый — как в chips-pack: тянуть серверный SQL-клиент в модуль,
 * который лежит рядом с server-fn маркета, незачем.
 */
export async function loadStunUntil(chipIds: string[]): Promise<Map<string, string>> {
  const ids = chipIds.filter(Boolean);
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { loadChipEffects } = await import("./beta-raid/chip-effects");
  const effects = await loadChipEffects(ids).catch(() => []);
  for (const e of effects) if (e.kind === "stun") out.set(e.chipId, e.expiresAt);
  return out;
}

/** Сколько минут осталось до конца оглушения. Минимум 1: «через 0 минут» — не ответ. */
export function stunMinutesLeft(expiresAt: string): number {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(1, Math.ceil(ms / 60_000));
}
