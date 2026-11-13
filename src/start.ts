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
import { createMiddleware, createStart } from "@tanstack/react-start";
import { cspHeaders, hasCsp, newNonce } from "@/lib/csp/cspPolicy";
import { oversizedBody } from "@/lib/http/bodyLimit";
import { serverFnFetch } from "@/lib/serverFnTransport";
import { serverFnPerf } from "@/server/perf/fnMiddleware";

// Потолок размера запроса (lib/http/bodyLimit.ts): тяжёлое отбивается по
// заголовку, тело не читается. Стоит первым — до любой другой работы.
const bodyLimitMiddleware = createMiddleware({ type: "request" }).server(({ next, request }) => {
  const refused = oversizedBody(request.method, new URL(request.url).pathname, request.headers);
  if (refused) throw refused;
  return next();
});

// Защитный заголовок страницы (lib/csp/cspPolicy.ts): своя метка на каждый ответ,
// она же уходит в разметку встроенных скриптов (router.tsx → ssr.nonce).
const cspMiddleware = createMiddleware({ type: "request" }).server(async ({ next }) => {
  const nonce = newNonce();
  const result = await next({ context: { cspNonce: nonce } });
  const type = result.response.headers.get("content-type") ?? "";
  if (type.includes("text/html") && !hasCsp(result.response.headers)) {
    try {
      for (const [k, v] of Object.entries(cspHeaders(nonce))) result.response.headers.set(k, v);
    } catch {
      // Заголовки ответа заморожены (редкий путь) — страница уходит как раньше.
    }
  }
  return result;
});

export const startInstance = createStart(() => ({
  requestMiddleware: [bodyLimitMiddleware, cspMiddleware],
  serverFns: { fetch: serverFnFetch },
  // Секундомер на каждую server-функцию (perf/fnMiddleware): имя и время в
  // общий отчёт /api/perf. Одно место — и ни одну функцию оборачивать не надо.
  functionMiddleware: [serverFnPerf],
}));
