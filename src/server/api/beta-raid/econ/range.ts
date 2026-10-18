// Окно отчёта «$ Экономика»: разбор входа и SQL-фрагмент по дате.
//
// Клиент присылает ISO-пару from/to; сервер зажимает её сам, а не верит:
// «to» в будущем даёт пустой хвост и ломает кэш-ключ, окно шире ECON_MAX_DAYS
// на currency_ledger (миллионы строк) кладёт базу. Поэтому границы
// нормализуются здесь и только здесь — все отчёты берут окно отсюда.
import { z } from "zod";
import { sqlStr } from "@/server/api/raid-shared";
import { ECON_MAX_DAYS, type EconRange } from "@/lib/econ/types";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

export const rangeSchema = z.object({ from: z.string().min(1), to: z.string().min(1) });

export type RangeInput = z.infer<typeof rangeSchema>;

/**
 * Привести окно к безопасному: to ≤ конца текущей минуты, from < to, ширина
 * ≤ ECON_MAX_DAYS. Кривая дата — ошибка наружу (клиент шлёт toISOString,
 * иное — баг). Пустое или перевёрнутое окно сжимается до суток перед «to».
 *
 * Почему «до конца минуты», а не до now: клиент округляет «to» пресета вверх
 * до минуты, чтобы ключ react-query не менялся каждый кадр. Прижми мы его к
 * now с точностью до миллисекунды — ключ серверного кэша (cache.ts) был бы
 * новым на каждый вызов, и 30-секундный memo не спасал бы базу вовсе.
 */
export function normalizeRange(input: RangeInput, now: number = Date.now()): EconRange {
  const rawTo = Date.parse(input.to);
  const rawFrom = Date.parse(input.from);
  if (!Number.isFinite(rawTo) || !Number.isFinite(rawFrom)) {
    throw new Error("Окно отчёта: дата не разобрана");
  }
  const to = Math.min(rawTo, Math.ceil(now / MINUTE_MS) * MINUTE_MS);
  let from = rawFrom;
  if (from >= to) from = to - DAY_MS;
  if (to - from > ECON_MAX_DAYS * DAY_MS) from = to - ECON_MAX_DAYS * DAY_MS;
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

/** `col >= 'from' AND col < 'to'` — правая граница открыта, чтобы дни не двоились. */
export function rangeSql(col: string, range: EconRange): string {
  return `${col} >= ${sqlStr(range.from)} AND ${col} < ${sqlStr(range.to)}`;
}

/** Значение времени из row_to_json (timestamptz/date) → ISO-строка для клиента. */
export function toIso(v: unknown): string {
  const t = typeof v === "string" || typeof v === "number" ? new Date(v) : new Date(NaN);
  return Number.isFinite(t.getTime()) ? t.toISOString() : String(v ?? "");
}
