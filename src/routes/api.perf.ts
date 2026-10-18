// Отчёт о скорости машинным способом: тот же снимок, что на /admin/perf, но
// без браузера и без сессии — по служебному ключу.
//
// Зачем отдельный вход. Счётчики живут в памяти работающего процесса, и
// добраться до них можно только через него самого. Пока смотреть их можно было
// лишь глазами в админке, проверка «стало ли быстрее после выката» требовала
// живого человека с открытой вкладкой. Теперь ответ снимается с сервера в одну
// строку — и обычной проверкой после деплоя, и в любой момент разбора.
//
// Что внутри (всё — числа, без картинок):
//   сервер     — все воркеры кластера разом (perf/snapshots): каждая
//                server-функция по имени (fn:getBetaRaidMap …), запросы к
//                базе, шаг; медиана, 95-й, худшее, ошибки;
//   sse        — живой канал: событий по типам, подписчиков, отправок в минуту;
//   клиенты    — пробы с устройств игроков (perf/clientStore): кадры, длинные
//                задачи, куча, вес и время ответов глазами телефона;
//   ?hours=N   — окно для клиентов (1…48, по умолчанию 24).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/perf")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        // Ключ обязателен: снимок называет операции и таблицы, посторонним про
        // внутренности сервера знать незачем.
        if (!secret) return new Response("perf disabled", { status: 404 });
        const { bearerMatches } = await import("@/server/perf/bearer");
        if (!(await bearerMatches(request.headers.get("authorization"), secret)))
          return new Response("unauthorized", { status: 401 });

        const url = new URL(request.url);
        const hours = Number(url.searchParams.get("hours") ?? 24) || 24;
        // Серверные модули — только внутри обработчика: файл маршрута попадает
        // в клиентский бандл, и статический импорт утянул бы их туда.
        const [{ clusterReport }, { clientSummary }, { sagging }, { perfSnapshot }] =
          await Promise.all([
            import("@/server/perf/snapshots"),
            import("@/server/perf/clientStore"),
            import("@/server/perf/watchdog"),
            import("@/server/perf/trace"),
          ]);
        const local = perfSnapshot();
        const [cluster, clients] = await Promise.all([
          clusterReport().catch((e: Error) => ({ error: e.message })),
          clientSummary(hours).catch((e: Error) => ({ error: e.message })),
        ]);
        const rows = "rows" in cluster ? cluster.rows : local.rows;
        return new Response(
          JSON.stringify(
            {
              копится_мин: Math.round((Date.now() - local.since) / 60_000),
              воркеров: "workers" in cluster ? cluster.workers : 1,
              просели: sagging(rows).map((s) => ({
                операция: s.row.name,
                p95: s.row.p95,
                порог: s.limit,
              })),
              сервер: cluster,
              этот_воркер: local.rows,
              клиенты: clients,
            },
            null,
            1,
          ),
          { headers: { "content-type": "application/json; charset=utf-8" } },
        );
      },
    },
  },
});
