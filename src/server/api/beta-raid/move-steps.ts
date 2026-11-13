// Несколько шагов маршрута одним запросом (§8.84, «просчитывать наперёд»): клиент
// шлёт пачку шагов заранее, пока герой бежит по уже принятым, — ход не ждёт сеть
// на каждом шаге. Каждый шаг — тот же performStep со всеми правилами, ценой, CAS
// позиции и тормозом частоты по коню; по порядку, первый отказ останавливает пачку.
import { performStep, type StepResult, type StepTo } from "./move-step";

/** Больше шагов за раз клиент не шлёт (наперёд — до 2 × 4). */
export const MAX_STEPS_CHUNK = 8;

export type StepsResult = {
  /** Принятые шаги по порядку. */
  results: StepResult[];
  /** Отказ шага, на котором пачка встала (текст или ключ словаря); null — все прошли. */
  error: string | null;
};

export async function performSteps(wallet: string, steps: StepTo[]): Promise<StepsResult> {
  const results: StepResult[] = [];
  for (const step of steps.slice(0, MAX_STEPS_CHUNK)) {
    try {
      results.push(await performStep(wallet, step));
    } catch (e) {
      return { results, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return { results, error: null };
}
