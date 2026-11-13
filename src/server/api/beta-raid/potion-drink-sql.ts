// SQL «выпить зелья»: ключ нажатия, списание всего набора и ВСЕ эффекты —
// одной транзакцией (один вызов mcpExec, несколько операторов).
//
// До 22.10 (замечание дизайнера 20.10) это были отдельные запросы: занять
// ключ → списать каждый вид → наложить каждый эффект. Сбой на k-м эффекте
// возвращал зелья в сумку, а эффекты 1…k−1 оставались — бесплатно; повтор
// того же нажатия накладывал их ещё раз. Теперь либо записано всё (ключ,
// списание, эффекты), либо ничего: ошибка любого оператора откатывает всю
// транзакцию, возвращать и снимать вручную нечего.
//
// Порядок: лок забвения (если оно в наборе) и лок рюкзака `bp:<герой>` —
// отдельными операторами до WITH (ПРАВИЛА §8.15/§8.20: лок внутри WITH не
// освежает снимок). Строки стопок — FOR UPDATE: рюкзак тратят и мимо лока
// (оплата), запертая строка до конца транзакции не изменится.
//
// Ключ — hero_boost_op той же вставкой, что и всё остальное: `mark` пустой
// (не хватило штук, ключ уже чей-то) — не пишется ничего. Повтор моста шлёт
// тот же текст с той же меткой: `prior` = своя метка — «выпито этим же
// нажатием», второй раз не списываем и не накладываем.
//
// Без обёртки wrapJson: изменяющие CTE — верхний уровень. Комментарии внутри
// SQL — только блочные.
import { sqlStr } from "@/server/api/raid-shared";
import { originCols, originSetSql, originTakeSql } from "@/server/api/beta-raid/stack-origin";
import { oblivionLockSql, oblivionPutSql } from "@/server/api/beta-raid/oblivion-sql";
import { satietyMoveSql } from "@/server/api/beta-raid/hero-satiety-sql";
import { TIMED_EFFECT_UPSERT } from "@/server/api/beta-raid/timed-effect-sql";
import type { DrinkEffects, DrinkNeed } from "@/server/api/beta-raid/potion-drink-plan";

export type DrinkSqlInput = {
  /** Ключ нажатия (hero_boost_op.op). */
  op: string;
  /** Своя метка этого вызова — по ней повтор моста узнаёт себя. */
  mark: string;
  heroId: string;
  account: string;
  /** Для строки ключа: ответ повторному нажатию (boostOpAmount). */
  stat: string;
  amount: number;
  /** Что списать — уже склеенное по ключу (drinkNeeds), не пусто. */
  need: DrinkNeed[];
  effects: DrinkEffects;
  /** Кому сытость (выбранный герой, как moveSatiety) и её потолок. */
  satietyHero: { heroId: string; max: number } | null;
  /** id новой строки эффекта. */
  newId: () => string;
};

/** Ответ последнего оператора. */
export type DrinkSqlRow = {
  /** Метка уже лежавшего ключа (null — ключа не было). */
  prior: string | null;
  /** Ключ занят ЭТИМ выполнением — списано и наложено. */
  fresh: boolean;
  /** Сколько стопок списано этим выполнением. */
  took: number;
  /** Первый вид, которого не хватило (null — хватило всех). */
  short: string | null;
};

const GATE = "EXISTS (SELECT 1 FROM mark)";
const EFFECT_COLS = "(id, account_id, kind, value, expires_at, created_at, source)";
const until = (minutes: number): string =>
  `now() + interval '${Math.max(1, Math.floor(minutes))} minutes'`;
const num = (v: number): string => String(Number.isFinite(v) ? v : 0);

/** CTE эффектов: только то, что есть в наборе. Все — под ключом `mark`. */
function effectCtes(o: DrinkSqlInput): string[] {
  const acc = sqlStr(o.account);
  const out: string[] = [];
  const { buffs, timed, oblivion, satiety } = o.effects;
  if (buffs.length) {
    const rows = buffs
      .map(
        (b) =>
          `(${sqlStr(o.newId())}, ${sqlStr(b.kind)}, ${Math.floor(b.value)}, ${until(b.minutes)})`,
      )
      .join(",\n              ");
    out.push(`buff AS (
       INSERT INTO yuplink.beta_raid_player_effects ${EFFECT_COLS}
       SELECT v.id, ${acc}, v.kind, v.value, v.exp, now(), NULL
         FROM (VALUES ${rows}) v (id, kind, value, exp)
        WHERE ${GATE}
       RETURNING 1
     )`);
  }
  if (timed.length) {
    const rows = timed
      .map((t) => `(${sqlStr(o.newId())}, ${sqlStr(t.kind)}, ${until(t.minutes)})`)
      .join(", ");
    out.push(`timed AS (
       INSERT INTO yuplink.beta_raid_player_effects ${EFFECT_COLS}
       SELECT v.id, ${acc}, v.kind, 1, v.exp, now(), NULL
         FROM (VALUES ${rows}) v (id, kind, exp)
        WHERE ${GATE}
       ${TIMED_EFFECT_UPSERT}
       RETURNING 1
     )`);
  }
  for (const ob of oblivion) {
    const put = oblivionPutSql(
      { id: o.newId(), account: o.account, level: ob.level, minutes: ob.minutes, source: null },
      "mark",
    );
    if (put) out.push(`obl_${ob.mode} AS (\n      ${put}\n      RETURNING 1\n    )`);
  }
  if (satiety > 0 && o.satietyHero) {
    out.push(`sat AS (${satietyMoveSql(o.satietyHero.heroId, o.satietyHero.max, satiety, GATE)})`);
  }
  return out;
}

/** Весь вызов: локи, затем один WITH; ответ — последней строкой (DrinkSqlRow). */
export function potionDrinkSql(o: DrinkSqlInput): string {
  if (!o.need.length) throw new Error("potion-drink: пустой набор");
  const hero = sqlStr(o.heroId);
  const op = sqlStr(o.op);
  const need = o.need
    .map((n, i) => `(${sqlStr(n.stackKey)}::text, ${num(n.qty)}::numeric, ${i})`)
    .join(", ");
  const left = "(s.count - s.n)";
  const locks = [
    o.effects.oblivion.length ? oblivionLockSql(o.account) : "",
    `SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`bp:${o.heroId}`)})) AS l;`,
  ].filter(Boolean);
  const ctes = [
    `prior AS (
       SELECT b.source FROM yuplink.hero_boost_op b WHERE b.op = ${op}
     )`,
    `need (stack_key, n, i) AS (VALUES ${need})`,
    `src AS (
       SELECT h.id, h.stack_key, h.count, need.n
         FROM yuplink.raid_hero_backpack h JOIN need ON need.stack_key = h.stack_key
        WHERE h.hero_id = ${hero} AND h.count >= need.n AND NOT EXISTS (SELECT 1 FROM prior)
          FOR UPDATE OF h
     )`,
    `mark AS (
       INSERT INTO yuplink.hero_boost_op (op, hero_id, stat, amount, source)
       SELECT ${op}, ${hero}, ${sqlStr(o.stat)}, ${num(o.amount)}, ${sqlStr(o.mark)}
        WHERE (SELECT count(*) FROM src) = ${o.need.length}
       ON CONFLICT (op) DO NOTHING
       RETURNING op
     )`,
    `upd AS (
       UPDATE yuplink.raid_hero_backpack h
          SET count = ${left}, ${originSetSql(originTakeSql(originCols("h."), left))},
              updated_at = now()
         FROM src s
        WHERE h.id = s.id AND s.count > s.n AND ${GATE}
       RETURNING h.id
     )`,
    `del AS (
       DELETE FROM yuplink.raid_hero_backpack h USING src s
        WHERE h.id = s.id AND s.count <= s.n AND ${GATE}
       RETURNING h.id
     )`,
    ...effectCtes(o),
  ];
  return `${locks.join("\n     ")}
     WITH ${ctes.join(",\n     ")}
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT source FROM prior) AS prior,
              EXISTS (SELECT 1 FROM mark) AS fresh,
              ((SELECT count(*) FROM upd) + (SELECT count(*) FROM del))::int AS took,
              (SELECT n.stack_key FROM need n
                WHERE NOT EXISTS (SELECT 1 FROM src s WHERE s.stack_key = n.stack_key)
                ORDER BY n.i LIMIT 1) AS short
     ) _t;`;
}
