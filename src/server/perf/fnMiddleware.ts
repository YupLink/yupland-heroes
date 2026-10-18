// Секундомер на КАЖДУЮ server-функцию: имя, длительность, ошибка.
//
// Зачем. Замеры были только у базы и у шага: «бд: запрос», «рейд: шаг». Кто из
// вызовов экрана дорогой сам по себе — карта, раскладка игроков, причалы,
// туман — было не видно, а ответ на «что грузит сервер» начинается именно с
// этого. Подключается один раз в src/start.ts как functionMiddleware, дальше
// каждая createServerFn приходит сюда сама: TanStack кладёт в serverFnMeta её
// имя из исходника (getBetaRaidMap), и в отчёте она так и называется.
//
// Стоимость — два Date.now() и запись в Map на вызов. Результат не трогаем и
// не сериализуем: размер ответа считает клиент (perf/clientProbe) — ему он и
// важен, там же и байты по проводу.
import { createMiddleware } from "@tanstack/react-start";
import { isNotFound, isRedirect } from "@tanstack/react-router";

export const serverFnPerf = createMiddleware({ type: "function" }).server(
  async ({ next, serverFnMeta }) => {
    const started = Date.now();
    const name = `fn:${serverFnMeta?.name ?? "?"}`;
    // Динамический импорт: клиентская часть middleware вырезается сборкой, но
    // статический импорт серверного модуля жил бы в бандле и без неё.
    const { note } = await import("./trace");
    try {
      const result = await next();
      note(name, Date.now() - started);
      // Имя функции — клиенту заголовком: проба на устройстве (lib/perf/
      // clientProbe) видит только адрес /_serverFn/<хэш> и без подсказки не
      // знала бы, чей это ответ весом в мегабайты.
      try {
        const { setResponseHeader } = await import("@tanstack/react-start/server");
        setResponseHeader("x-fn", serverFnMeta?.name ?? "?");
      } catch {
        /* вызов без HTTP-ответа (SSR напрямую) — заголовок ставить некуда */
      }
      return result;
    } catch (e) {
      // Редирект и notFound — штатные ответы, а не сбои.
      note(name, Date.now() - started, { error: !isRedirect(e) && !isNotFound(e) });
      throw e;
    }
  },
);
