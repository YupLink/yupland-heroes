// Уведомления react-query — одной пачкой на кадр.
//
// По умолчанию библиотека будит подписчиков через setTimeout(0) на КАЖДЫЙ
// пришедший ответ. Конец пути героя — это «энергия» и «состояние рейда»,
// приходящие с разницей в 3 мс, а через полсекунды «газеты» и «мешочки
// рядом»: каждый ответ — отдельная задача, и экран рейда (около сотни
// компонентов и 80 подписок на запросы) перерисовывался на каждый целиком.
// Замер 06.11.2026 на проде (телефон ×16): 5–6 перерисовок на конец пути,
// по 30–40 мс каждая.
//
// Здесь всё, что пришло до ближайшего кадра, уходит одним вызовом: React
// склеивает такие обновления в одну перерисовку. Запасной таймер нужен,
// когда кадров нет (вкладка в фоне, вебвью свёрнут): уведомление не должно
// ждать возвращения игрока дольше FALLBACK_MS.

type Task = () => void;

export type FrameEnv = {
  frame: (cb: () => void) => void;
  timeout: (cb: () => void, ms: number) => void;
  hidden: () => boolean;
};

/** Сколько ждём кадр, прежде чем выполнить пачку таймером. */
export const FALLBACK_MS = 100;

const browserEnv = (): FrameEnv => ({
  frame: (cb) => window.requestAnimationFrame(() => cb()),
  timeout: (cb, ms) => window.setTimeout(cb, ms),
  hidden: () => document.visibilityState === "hidden",
});

/** Планировщик для notifyManager.setScheduler: задачи копятся до кадра. */
export function makeFrameScheduler(env: FrameEnv = browserEnv()): (task: Task) => void {
  let pending: Task[] = [];
  /** Номер пачки: кадр и запасной таймер выполняют её один раз. */
  let armed = 0;
  let next = 0;

  const run = (id: number) => {
    if (armed !== id) return;
    armed = 0;
    const list = pending;
    pending = [];
    for (const task of list) {
      try {
        task();
      } catch (e) {
        // Ошибка одного подписчика не должна съесть уведомления остальных.
        queueMicrotask(() => {
          throw e;
        });
      }
    }
  };

  return (task) => {
    pending.push(task);
    if (armed) return;
    const id = ++next;
    armed = id;
    if (env.hidden()) {
      env.timeout(() => run(id), 0);
      return;
    }
    env.frame(() => run(id));
    env.timeout(() => run(id), FALLBACK_MS);
  };
}
