// Частотный гард: сколько раз в окно можно дёрнуть одну и ту же ручку.
//
// В проекте его не было вовсе, и это множитель ко всему остальному: почти
// каждая закрытая дыра требовала «нажать N раз одновременно». Замки и
// одноразовые ключи теперь на месте, но лишний рубеж дешёвый, а стоимость
// ошибки — очередная раздача из воздуха.
//
// Счётчик живёт в БАЗЕ (yuplink.rate_hits): процессов игры может быть два
// (рабочий + запасной под нагрузку), и счётчик в памяти каждого давал бы
// каждому игроку двойную норму. Один запрос на проверку (~2 мс): вставить
// метку и вернуть, сколько их в окне. База недоступна — считаем в памяти
// процесса, как раньше, чтобы платёж не встал из-за гарда.
//
// ВАЖНО про подбор чисел: слишком строгий лимит ломает игру честному игроку,
// который просто быстро тапает. Поэтому окна широкие, а пороги выше любого
// живого ритма — гард ловит скрипт, а не человека.
import { mcpExec } from "./db/mcpClient";
import { sqlStr } from "./api/raid-shared";

type Hit = { at: number };

const hits = new Map<string, Hit[]>();
let lastSweep = 0;
let lastDbSweep = 0;
let ensured: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!ensured) {
    ensured = mcpExec(
      `CREATE TABLE IF NOT EXISTS yuplink.rate_hits (
         key text PRIMARY KEY,
         at timestamptz[] NOT NULL
       );`,
      { wrapJson: false },
    ).then(() => undefined);
  }
  return ensured;
}

/** Раз в минуту выкидываем протухшие ключи, чтобы карта не росла вечно. */
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, arr] of hits) {
    if (!arr.some((h) => now - h.at < 120_000)) hits.delete(k);
  }
}

/** Память процесса — запасной путь, когда база не ответила. */
function memoryGate(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now);
  const arr = (hits.get(key) ?? []).filter((h) => now - h.at < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return false;
  }
  arr.push({ at: now });
  hits.set(key, arr);
  return true;
}

/**
 * Одним запросом: оставить метки внутри окна, дописать текущую, вернуть их
 * число. Больше лимита — попытка сверх нормы (она тоже учтена: молотить
 * дальше бессмысленно).
 */
async function dbGate(key: string, limit: number, windowMs: number): Promise<boolean | null> {
  await ensureSchema();
  const rows = (await mcpExec(
    `INSERT INTO yuplink.rate_hits (key, at) VALUES (${sqlStr(key)}, ARRAY[now()])
     ON CONFLICT (key) DO UPDATE SET at = COALESCE(
       (SELECT array_agg(t) FROM unnest(yuplink.rate_hits.at) AS t
         WHERE t > now() - (${Math.ceil(windowMs)} * interval '1 millisecond')),
       ARRAY[]::timestamptz[]) || now()
     RETURNING cardinality(at) AS n;`,
    // INSERT … RETURNING в подзапрос не заворачивается — только через WITH.
    { wrapJsonCte: true },
  )) as Array<{ n: number | string }> | null;
  const n = Number(rows?.[0]?.n);
  if (!Number.isFinite(n)) return null;
  const now = Date.now();
  if (now - lastDbSweep > 60_000) {
    lastDbSweep = now;
    void mcpExec(
      `DELETE FROM yuplink.rate_hits WHERE at[cardinality(at)] < now() - interval '2 minutes';`,
      { wrapJson: false },
    ).catch(() => {
      /* приберём в следующий раз */
    });
  }
  return n <= limit;
}

/**
 * Пропустить вызов или бросить. `key` обязан включать того, кого ограничиваем
 * (кошелёк/аккаунт), иначе один игрок закроет ручку всем остальным.
 */
export async function rateGate(
  key: string,
  opts?: { limit?: number; windowMs?: number; message?: string },
): Promise<void> {
  const limit = opts?.limit ?? 20;
  const windowMs = opts?.windowMs ?? 10_000;
  let ok: boolean | null = null;
  try {
    ok = await dbGate(key, limit, windowMs);
  } catch {
    ok = null;
  }
  if (ok === null) ok = memoryGate(key, limit, windowMs);
  if (!ok) throw new Error(opts?.message ?? "Слишком часто — подожди пару секунд");
}

/** Деньги внутрь и наружу: реже, чем игровые действия. */
export function moneyGate(what: string, wallet: string | null): Promise<void> {
  return rateGate(`money:${what}:${wallet ?? "-"}`, {
    limit: 6,
    windowMs: 10_000,
    message: "Слишком часто — подожди несколько секунд и повтори",
  });
}

/** Игровые действия: тапают быстро, порог выше живого ритма. */
export function actionGate(what: string, wallet: string | null): Promise<void> {
  return rateGate(`act:${what}:${wallet ?? "-"}`, { limit: 30, windowMs: 10_000 });
}

/** Подбор кода: окно длинное, порог низкий. */
export function guessGate(what: string, wallet: string | null): Promise<void> {
  return rateGate(`guess:${what}:${wallet ?? "-"}`, {
    limit: 10,
    windowMs: 60_000,
    message: "Слишком много попыток — попробуй через минуту",
  });
}
