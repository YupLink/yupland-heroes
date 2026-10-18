// Поимка удочкой (ПРАВИЛА §8.35) — ОДИН оператор под локом героя `bp:<герой>`
// (тем же, что у удара топором и лопатой, выдачи в рюкзак и выбора основного):
// захват k созревших попыток рыбалки и износ удочки за каждую из них — с рыбой
// и без (шанс решает вызывающий — lib/raid/fishing.fishHit).
//
// Захват — CAS по счётчику попыток: рыбалка этого нажатия, идёт, попыток ровно
// C. Из двух вкладок и повтора моста захватывает один; второй видит другой
// счётчик и ничего не трогает. Износ — арифметика hitStackTimes
// (lib/raid/toolWear): удар — каждая попытка; целых штук может не хватить —
// отыграно столько попыток, сколько удочка выдержала (done), рыба — те из них,
// что в succ (hits); tries растёт на done, caught — на hits.
// Бьёт только удочка в руках (гард основного mainOkSql 'rod', §8.24); стопка,
// ставшая основной поимкой (замена кончившейся удочки), записывается тем же
// оператором. Отката нет: пойманное не пропадает (выдача — в рюкзак, мешочек
// или «Добычу»), поэтому и износ назад не нужен.
//
// Ответ потерян, а повтор моста уже не находит счётчик C — свой захват узнаётся
// по claim (ключ этого вызова): отыграно = tries − C. Сломанная до нуля стопка
// остаётся строкой с count 0 (как после удара, §8.19) — игроку не видна.
// Комментарии внутри SQL — только блочные.
import { sqlStr } from "@/server/api/raid-shared";
import { adoptSql, mainOkSql } from "@/server/api/beta-raid/main-tool/main-tool-sql";

/**
 * Арифметика k ударов над строками `src` (колонки count, wear): CTE rc1, rc2 и
 * calc с колонками hits (выдержано ударов), broken (сломано штук) и rest (износ
 * новой текущей штуки). step, k, per — SQL-выражения (литералы в бою, колонки
 * в сверке по VALUES): per = ceil(100 / step).
 */
export function timesCtes(src: string, step: string, k: string, per: string): string {
  return `rc1 AS (
      SELECT x.*, FLOOR(x.count) AS whole,
             GREATEST(1, CEIL((100 - x.wear) / (${step})::numeric)) AS first
        FROM ${src} x
    ),
    rc2 AS (
      SELECT x.*, CASE WHEN x.whole >= 1 THEN LEAST(${k}, x.first + (x.whole - 1) * (${per}))
                       ELSE 0 END AS hits
        FROM rc1 x
    ),
    calc AS (
      SELECT x.*,
             CASE WHEN x.hits < x.first THEN 0
                  ELSE 1 + FLOOR((x.hits - x.first) / (${per})) END AS broken,
             CASE WHEN x.hits < x.first THEN x.wear + x.hits * (${step})
                  ELSE MOD(x.hits - x.first, ${per}) * (${step}) END AS rest
        FROM rc2 x
    )`;
}

export type CatchAt = {
  heroId: string;
  /** Стопка удочки в руках (pickMainTool 'rod'). */
  rodKey: string;
  account: string;
  /** Ключ заброса (op нажатия «Забросить»). */
  sid: string;
  /** Попыток отыграно до захвата (CAS). */
  tries: number;
  /** Сколько попыток созрело. */
  k: number;
  /** Номера попыток с рыбой внутри захвата (с 1, по возрастанию) — столько ударов удочкой. */
  succ: number[];
  /** «Износ за удар, %» удочки: 1…100 (пусто — 100). */
  step: number;
  intervalMin: number;
  /** Ключ этого вызова: по нему повтор моста узнаёт свой захват. */
  nonce: string;
  /** Герой был на месте в этот миг (мс базы) — «видели»; null — не трогать. */
  seenMs: number | null;
};

/** Ответ поимки. */
export type CatchRow = {
  /** Поймано рыб (ударов удочкой выдержано). */
  hits: number | string;
  /** Отыграно попыток. */
  done: number | string;
  /** Рыбалка всё ещё та и с тем же счётчиком (иначе захватил другой). */
  live: boolean;
  /** Удочка в руках по гарду основного. */
  main: boolean;
  /** У героя есть целая штука этой стопки. */
  have: boolean;
  claim: string | null;
  caught: number | string | null;
  tries: number | string | null;
};

/**
 * Захват k созревших попыток. Каждая — удар удочкой; рыба — в попытках succ.
 * Удочки не хватило — отыграны попытки, что она выдержала (done < k), рыба — из
 * них.
 */
export function catchSql(o: CatchAt): string {
  const step = Math.min(100, Math.max(1, Math.round(o.step)));
  const k = Math.max(1, Math.floor(o.k));
  const succ = [...new Set(o.succ.map((x) => Math.floor(x)))]
    .filter((x) => x >= 1 && x <= k)
    .sort((a, b) => a - b);
  const per = Math.ceil(100 / step);
  const [hero, key, acc, sid] = [
    sqlStr(o.heroId),
    sqlStr(o.rodKey),
    sqlStr(o.account),
    sqlStr(o.sid),
  ];
  const was = Math.max(0, Math.floor(o.tries));
  const main = mainOkSql(o.heroId, o.rodKey, "rod");
  const seen = o.seenMs === null ? "NULL" : `to_timestamp(${Math.floor(o.seenMs)} / 1000.0)`;
  const live = `f.account_id = ${acc} AND f.op = ${sid} AND f.tries = ${was} AND f.stopped_at IS NULL`;
  const arr = `ARRAY[${succ.join(", ")}]::int[]`;
  return `SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`bp:${o.heroId}`)})) AS l;
    WITH s AS (
      SELECT f.account_id FROM yuplink.raid_fishing f WHERE ${live} FOR UPDATE
    ),
    src AS (
      SELECT b.id, b.count, b.wear, b.mob_count
        FROM yuplink.raid_hero_backpack b
       WHERE b.hero_id = ${hero} AND b.stack_key = ${key} AND b.count >= 1
         AND EXISTS (SELECT 1 FROM s) AND ${main}
         FOR UPDATE
    ),
    ${timesCtes("src", String(step), String(k), String(per))},
    upd AS (
      UPDATE yuplink.raid_hero_backpack b
         SET count = c.count - c.broken,
             wear = CASE WHEN c.count - c.broken >= 1 THEN c.rest ELSE 0 END,
             mob_count = LEAST(c.mob_count, c.count - c.broken),
             updated_at = now()
        FROM calc c
       WHERE b.id = c.id AND c.hits > 0
      RETURNING c.hits
    ),
    d AS (
      SELECT h.done,
             (SELECT count(*) FROM unnest(${arr}) x WHERE x <= h.done)::int AS hits
        FROM (SELECT COALESCE((SELECT hits FROM upd), 0)::int AS done) h
       WHERE EXISTS (SELECT 1 FROM s)
    ),
    adv AS (
      UPDATE yuplink.raid_fishing f
         SET tries = f.tries + d.done, caught = f.caught + d.hits,
             next_at = f.next_at + (d.done * ${Math.max(1, Math.floor(o.intervalMin))}) * interval '1 minute',
             claim = ${sqlStr(o.nonce)}, seen_at = GREATEST(f.seen_at, ${seen}), updated_at = now()
        FROM d
       WHERE ${live} AND d.done > 0
      RETURNING f.tries
    ),
    adopt AS (${adoptSql(o.heroId, o.rodKey, "upd")})
    SELECT row_to_json(_t.*) AS _row FROM (
      SELECT COALESCE((SELECT hits FROM d), 0) AS hits, COALESCE((SELECT done FROM d), 0) AS done,
             EXISTS (SELECT 1 FROM s) AS live, ${main} AS main,
             EXISTS (SELECT 1 FROM yuplink.raid_hero_backpack hv
                      WHERE hv.hero_id = ${hero} AND hv.stack_key = ${key} AND hv.count >= 1) AS have,
             (SELECT f.claim FROM yuplink.raid_fishing f WHERE f.account_id = ${acc}) AS claim,
             (SELECT f.caught FROM yuplink.raid_fishing f WHERE f.account_id = ${acc}) AS caught,
             (SELECT f.tries FROM yuplink.raid_fishing f WHERE f.account_id = ${acc}) AS tries
    ) _t;`;
}

/** Свой захват после потерянного ответа: claim и счётчики (wrapJson). */
export const claimSql = (account: string): string =>
  `SELECT claim, caught, tries FROM yuplink.raid_fishing WHERE account_id = ${sqlStr(account)}`;
