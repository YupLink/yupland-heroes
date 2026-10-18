// Точка входа TanStack Start. Плагин сам подхватывает src/start.ts (см.
// resolveStartEntryPlan в @tanstack/start-plugin-core: defaultEntry "start")
// и ждёт именно экспорт `startInstance` — до появления этого файла он был
// undefined, то есть опций Start у приложения просто не существовало.
//
// Единственное, что здесь настраивается, — свой fetch для server-функций.
// Он не меняет протокол, а называет своим именем один класс сбоев: ответ без
// content-type (перезапуск приложения за Caddy, обрезанный ответ прокси или
// телеграм-вебвью). Библиотека на таком ответе звала invariant(), и в проде
// игрок читал «Invariant failed». Подробности — в src/lib/serverFnTransport.ts.
import { createStart } from "@tanstack/react-start";
import { serverFnFetch } from "@/lib/serverFnTransport";
import { serverFnPerf } from "@/server/perf/fnMiddleware";

export const startInstance = createStart(() => ({
  serverFns: { fetch: serverFnFetch },
  // Секундомер на каждую server-функцию (perf/fnMiddleware): имя и время в
  // общий отчёт /api/perf. Одно место — и ни одну функцию оборачивать не надо.
  functionMiddleware: [serverFnPerf],
}));
