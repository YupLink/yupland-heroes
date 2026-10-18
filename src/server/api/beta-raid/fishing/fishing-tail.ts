// Досчёт «Улова» на финише турнира (аудит 14.10, п.2; ревью 14.10; ПРАВИЛА
// §8.35) — расчёт и SQL.
//
// Улов выдаётся лениво — при следующем чтении заброса, — а очко «Улова» пишет
// выдача (tour-sql.noteTimedSql): в идущий турнир и в закрытый, пока мест нет.
// Забросил на час и закрыл игру — клюнувшее до конца выдастся после мест; очко
// выдачи могло и сорваться (оно best effort). Поэтому на финише (турнир на
// выплате, мест нет) каждый заброс участника, задевший турнир, считается
// ЦЕЛИКОМ: все его поимки с мигом внутри [старт, конец) —
//  • отыгранные (попытки 1…tries; сверка со счётчиком поимок строки);
//  • ещё не отыгранные (tries+1…): горизонт как у досчёта
//    (fishing-row.fishHorizon), обрезанный концом турнира; попыток не больше
//    заказа и того, что выдержат удочки в руках.
// Рыба — тем же зерном (fishing-seed) и шансом строки, что и при выдаче; миг
// попытки n — миг первой + (n − 1) × шаг (next_at сдвигается на шаг за попытку),
// и шанс у неё — по этому мигу (после срока баффа удачи — без него).
//
// SQL вычитает уже легшее за этот заброс — очки выдачи 'fish:<акк>:<op>:…' и
// прошлого досчёта 'tail:fish:<акк>:<op>:…' — и кладёт остаток одним очком
// 'tail:fish:<акк>:<op>:<всего поимок>'. Всё под замком категории
// (tour-sql.lateLockSql): поздняя выдача ложится либо до досчёта (и вычтется),
// либо, увидев его очко, не ложится. Повтор финиша: остаток ноль, а то же
// «всего» — тот же ключ. Рыбу досчёт не выдаёт — игрок заберёт её сам.
// Заброс, закрытый и замещённый новым до чтения строк, досчёт не видит — его
// поздняя выдача уже легла очком сама.
import { sqlStr } from "@/server/api/raid-shared";
import { dueCount, type FishingConfig } from "@/lib/raid/fishing";
import { hitOffsetsAt } from "@/lib/raid/fishChanceSteps";
import { lateLockSql, scoreSql, tailPrefix, timedSource } from "@/server/api/tournament/tour-sql";
import { fishSeed } from "@/server/api/beta-raid/fishing/fishing-seed";
import { fishHorizon, tryChance } from "@/server/api/beta-raid/fishing/fishing-row";
import { catchKey } from "@/server/api/beta-raid/fishing/fishing-deliver";
import { rowsSql, type FishRow } from "@/server/api/beta-raid/fishing/fishing-sql";

/** Поимка заброса: чей, какой заброс и её миг (мс). */
export type CastHit = { account: string; op: string; at: number };

/** Источник очков заброса: ключ выдачи без номера поимки — 'fish:<акк>:<op>:'. */
export const castSource = (account: string, op: string): string =>
  timedSource(catchKey(account, op, 1));

/**
 * Поимки заброса с мигом в [startMs, endsMs): отыгранные и (заброс идёт) ещё
 * нет. rodTries — сколько попыток выдержат удочки в руках (нет удочки — 0:
 * досчёт тогда тоже не поймал бы ничего). Отыгранные с рыбой не сошлись со
 * счётчиком поимок (шанса в строке нет, а настройку мира меняли) — их не берём.
 */
export function castHits(o: {
  account: string;
  row: FishRow;
  cfg: FishingConfig;
  startMs: number;
  endsMs: number;
  rodTries: number;
}): CastHit[] {
  const { row, cfg } = o;
  if (cfg.items.length === 0 || !Number.isFinite(o.endsMs)) return [];
  const step = cfg.intervalMin * 60_000;
  const seed = fishSeed(o.account, row.op, row.salt);
  // Шанс попытки — по её мигу, как у выдачи (fishing-row.tryChance).
  const chance = tryChance(row, cfg.chancePct, step);
  const first = row.nextMs - row.tries * step;
  const played = row.tries > 0 ? hitOffsetsAt(seed, 1, row.tries, chance) : [];
  const times = played.length === row.caught ? played.map((n) => first + (n - 1) * step) : [];
  if (!row.stopped) {
    const left = Math.max(0, Math.min(row.planTries - row.tries, Math.floor(o.rodTries)));
    const horizon = Math.min(fishHorizon(row).horizon, o.endsMs);
    const k = dueCount(row.nextMs, horizon, step, left);
    const ahead = k > 0 ? hitOffsetsAt(seed, row.tries + 1, k, chance) : [];
    times.push(...ahead.map((x) => row.nextMs + (x - 1) * step));
  }
  return times
    .filter((at) => at >= o.startMs && at < o.endsMs)
    .map((at) => ({ account: o.account, op: row.op, at }));
}

/** Забросы оплативших участников, задевшие турнир (колонки rowsSql, wrapJson). */
export const tailRowsSql = (id: string): string =>
  rowsSql(`EXISTS (SELECT 1 FROM yuplink.tournament t
               JOIN yuplink.tournament_entry e ON e.tournament_id = t.id AND e.paid
              WHERE t.id = ${sqlStr(id)} AND e.account_id = f.account_id
                AND f.started_at < t.ends_at
                AND (f.stopped_at IS NULL OR f.stopped_at >= t.started_at))`);

/**
 * Досчёт: по забросу — поимки в [старт, конец) и не раньше оплаты минус уже
 * легшее за него; остаток — одно очко. Только «Улов» на выплате, чей конец
 * наступил, и пока мест нет.
 */
export function tailPointsSql(id: string, hits: readonly CastHit[]): string {
  const rows = hits
    .map((h) => {
      const src = castSource(h.account, h.op);
      return `(${sqlStr(h.account)}, ${sqlStr(src)}, ${sqlStr(tailPrefix(src))}, to_timestamp(${Math.floor(h.at)} / 1000.0))`;
    })
    .join(",\n         ");
  return (
    lateLockSql("fish_catch") +
    scoreSql({
      pre: `h (account_id, src, tail, at) AS (VALUES ${rows})`,
      src: `SELECT g.id AS tournament_id, g.tail || g.n AS ref, g.account_id,
            (g.n - c.got)::numeric AS qty, g.at
       FROM (SELECT t.id, h.account_id, h.src, h.tail, count(*) AS n, max(h.at) AS at
               FROM yuplink.tournament t
               JOIN yuplink.tournament_entry e ON e.tournament_id = t.id AND e.paid
               JOIN h ON h.account_id = e.account_id
              WHERE t.id = ${sqlStr(id)} AND t.status = 'paying' AND t.metric = 'fish_catch'
                AND t.ends_at <= now()
                AND NOT EXISTS (SELECT 1 FROM yuplink.tournament_place pl WHERE pl.tournament_id = t.id)
                AND h.at >= t.started_at AND h.at < t.ends_at AND h.at >= e.joined_at
              GROUP BY t.id, h.account_id, h.src, h.tail) g
      CROSS JOIN LATERAL (
        SELECT COALESCE(sum(p.qty), 0) AS got FROM yuplink.tournament_point p
         WHERE p.tournament_id = g.id AND p.account_id = g.account_id
           AND (left(p.ref, length(g.src)) = g.src OR left(p.ref, length(g.tail)) = g.tail)
      ) c`,
    })
  );
}
