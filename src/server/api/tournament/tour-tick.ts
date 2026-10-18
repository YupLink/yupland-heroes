// Часы турниров: раз в минуту каждый воркер запускает черновики, чьё время
// начала наступило (расписание, UTC), подтягивает очки идущих турниров, делает
// суточные снимки фарма, завершает те, чьё время вышло, и разбирает зависшие
// записи (tour-entry-settle: у открытого турнира — доводит, у закрытого —
// возвращает плату; сам игрок может больше и не прийти).
//
// Живёт внутри процесса, как зачистка подарков и авторассылки: таймер с unref
// процесс не держит, запускается лениво с первого чтения подарков. Два воркера
// разом безопасны: очки дедуплицирует PK (турнир, ref), финиш захватывает
// только один (CAS идущий → выплата), зависшую выплату доделывает любой.
//
// Проход — на границе минуты по часам (+2 с запаса на расхождение часов с
// базой), а не «через минуту от первого чтения подарков»: старт по расписанию
// в 00:00 случается в 00:00:02, а не до минуты позже. Живые категории (шаги,
// рубка) считают только идущий турнир, и каждая секунда до старта для них
// потеряна (журнальные подтянутся с start_at сами).

const EVERY_MS = 60_000;
const OFFSET_MS = 2_000;

let started = false;
let busy = false;

/** Через сколько мс ближайший проход: граница минуты + OFFSET_MS, (0, 60 с]. */
export function msToNextTick(nowMs: number): number {
  const next = Math.floor((nowMs - OFFSET_MS) / EVERY_MS) * EVERY_MS + OFFSET_MS + EVERY_MS;
  return next - nowMs;
}

const warn = (what: string, e: unknown) =>
  console.warn(`[tour] ${what}:`, e instanceof Error ? e.message : e);

/** Один проход часов. Ошибку одного турнира не пускаем на остальные. */
export async function tourTickPass(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    // Работа — лениво: сам модуль часов лёгкий, его тянет чтение подарков.
    const { loadActiveTours, syncTournament } = await import("./tour-sync");
    const { finishTournament } = await import("./tour-finish");
    const { autoStartDue } = await import("./tour-start");
    const { sweepStaleEntries } = await import("./tour-entry-settle");
    // Сначала автостарт по расписанию: стартовавший сразу попадает в подтяжку.
    await autoStartDue().catch((e) => warn("автостарт", e));
    await sweepStaleEntries().catch((e) => warn("зависшие записи", e));
    const tours = await loadActiveTours();
    for (const t of tours) {
      if (t.status === "running") {
        await syncTournament(t).catch((e) => warn(`подтяжка ${t.id}`, e));
        if (t.due) await finishTournament(t.id).catch((e) => warn(`финиш ${t.id}`, e));
      } else if (t.status === "paying" && t.stale) {
        await finishTournament(t.id, { takeOver: true }).catch((e) =>
          warn(`доделать выплату ${t.id}`, e),
        );
      }
    }
  } catch (e) {
    warn("часы", e);
  } finally {
    busy = false;
  }
}

/** Запустить часы в этом процессе (лениво). Только сервер: модуль тянет мост к базе. */
export function startTourTicker(): void {
  if (started || typeof setTimeout !== "function") return;
  if (!import.meta.env.SSR) return;
  started = true;
  // Цепочка таймеров, а не setInterval: каждый проход заново встаёт на границу
  // минуты, и задержки цикла событий не копятся за дни работы процесса.
  // Повтор — не ближе секунды: таймер, сработавший на миллисекунду раньше
  // границы, не должен назначить второй проход на ту же минуту.
  const arm = (gapMs: number) => {
    const h = setTimeout(
      () => {
        arm(1_000);
        void tourTickPass();
      },
      msToNextTick(Date.now() + gapMs) + gapMs,
    );
    (h as unknown as { unref?: () => void }).unref?.();
  };
  arm(0);
}
