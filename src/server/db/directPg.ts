// Прямое соединение с Postgres — короткий путь в обход моста.
//
// Как было. Приложение ходит в базу через postgres-mcp: HTTPS до
// mcp.yupland.io, SSE-сессия, JSON-RPC, и уже мост открывает соединение к
// Postgres. Приложение, мост и база стоят В ОДНОЙ docker-сети, но запрос всё
// равно выходит наружу через публичный домен и возвращается обратно. Замер на
// проде: медиана запроса 50 мс при том, что сама база отвечает за 0,4 мс, а в
// пике запросы стояли в очереди к мосту по полсекунды — канал-то один на весь
// процесс (MAX_INFLIGHT). Плюс триста с лишним обрывов SSE в сутки, каждый со
// своими повторами.
//
// Как стало. Если задан DIRECT_DATABASE_URL, тот же самый SQL уходит прямо в
// Postgres по внутренней сети. Мост при этом никуда не девается: он остаётся
// запасным путём, и любая беда с прямым каналом возвращает запрос на него.
//
// Что НЕ меняется: сам SQL, обёртки wrapJson/wrapJsonCte и формат ответа.
// Вызывающий код не знает, каким путём приехали строки, — иначе переключение
// пришлось бы проверять по всему приложению, а не в одном месте.
import type { Pool as PgPool, PoolConfig } from "pg";

/** Пул создаётся лениво: без переменной окружения его нет вовсе. */
let pool: PgPool | null = null;
let poolPromise: Promise<PgPool | null> | null = null;

/**
 * Прямой путь временно закрыт до этого момента (мс эпохи). Ставится после
 * сбоя: незачем на каждом запросе ломиться в упавшую базу, пока рядом живой
 * мост. Полминуты — столько же, сколько мост ждёт после «pool is closed».
 */
let closedUntil = 0;
const COOLDOWN_MS = 30_000;

export function directUrl(): string | null {
  const url = process.env.DIRECT_DATABASE_URL?.trim();
  return url ? url : null;
}

/** Готов ли короткий путь принимать запросы прямо сейчас. */
export function directReady(): boolean {
  return !!directUrl() && Date.now() >= closedUntil;
}

async function getPool(): Promise<PgPool | null> {
  if (pool) return pool;
  if (poolPromise) return poolPromise;
  const url = directUrl();
  if (!url) return null;
  poolPromise = (async () => {
    try {
      const { Pool } = await import("pg");
      const cfg: PoolConfig = {
        connectionString: url,
        // Столько же, сколько мост держал одновременных запросов: больше
        // соединений база не любит, меньше — снова очередь.
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 4_000,
        // Соединение по внутренней сети docker, TLS там не разложен.
        ssl: false,
      };
      const p = new Pool(cfg);
      // Ошибка на простаивающем соединении не должна ронять процесс: пул сам
      // заведёт новое, а нам довольно записи в лог.
      p.on("error", (e: Error) => console.warn("[pg] соединение отвалилось:", e.message));
      await p.query("SELECT 1");
      pool = p;
      return p;
    } catch (e) {
      console.warn("[pg] прямой путь не открылся, идём через мост:", (e as Error).message);
      closedUntil = Date.now() + COOLDOWN_MS;
      return null;
    } finally {
      poolPromise = null;
    }
  })();
  return poolPromise;
}

/** Сбой прямого пути: закрываем его на паузу, запрос уйдёт через мост. */
function markBroken(e: unknown): void {
  closedUntil = Date.now() + COOLDOWN_MS;
  console.warn("[pg] прямой путь закрыт на 30 с:", (e as Error).message);
}

/**
 * Выполнить готовый SQL напрямую. `null` — короткий путь недоступен, зовите
 * мост.
 *
 * Ошибки САМОГО ЗАПРОСА (синтаксис, ограничение, деление на ноль) бросаются
 * наружу как есть: это ответ базы, и мост ответил бы тем же. На мост уходят
 * только беды соединения — иначе повтор через мост маскировал бы ошибку в
 * коде и делал бы её вдвое дороже.
 */
export async function directExec(finalSql: string): Promise<Record<string, unknown>[] | null> {
  if (!directReady()) return null;
  const p = await getPool();
  if (!p) return null;
  try {
    const res = await p.query(finalSql);
    // Несколько statement в одном SQL: драйвер отдаёт МАССИВ результатов, и у
    // него нет rows. Раньше это читалось как «прямой путь не ответил», и тот
    // же SQL уходил на мост второй раз — правки админа исполнялись дважды и
    // медленно. Берём последний результат: RETURNING обычно в нём.
    const last = Array.isArray(res) ? res[res.length - 1] : res;
    return (last?.rows ?? []) as Record<string, unknown>[];
  } catch (e) {
    const msg = (e as Error).message || "";
    const broken =
      /connect|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|terminat|shutdown|too many clients|Connection terminated/i.test(
        msg,
      );
    if (broken) {
      markBroken(e);
      return null;
    }
    throw e;
  }
}

/** Для отчёта о скорости: каким путём сейчас ходят запросы. */
export function directState(): { enabled: boolean; ready: boolean; cooldownMs: number } {
  return {
    enabled: !!directUrl(),
    ready: directReady(),
    cooldownMs: Math.max(0, closedUntil - Date.now()),
  };
}
