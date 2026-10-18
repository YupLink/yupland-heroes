// SQL эффекта «Забвение»: выдать заряды/время и потратить их на забвение.
//
// Модель — lib/hero/boostOblivion.ts, правило пары «уровень + минуты» —
// lib/hero/oblivionRule.ts. На аккаунте до трёх строк beta_raid_player_effects:
// oblivion_lv (value — заряды, срок «навсегда»), oblivion_lvt (value — заряды,
// срок — до какого часа) и oblivion_time (без счёта, срок — до какого часа).
// Уникальный индекс (account_id, kind) у всего, что не buff_*, держит по строке
// на вид. Строки oblivion_lv / oblivion_time, выданные до 28.09, читаются и
// тратятся как раньше — без миграции.
//
// ⚠️ Все, кто ПИШЕТ эти строки, берут лок `oblivion:<аккаунт>` ОТДЕЛЬНЫМ
// оператором перед основным (как сеть сундука, chest-net-sql.ts): в READ
// COMMITTED снимок оператора берётся до его выполнения, и только так трата
// видит заряд, который не успел потратить соседний запрос. Два нажатия на
// последнем заряде — одно забывает, второе видит ноль.
//
// Мост повторяет запрос вслепую (mcpClient), поэтому:
//   • выдача несёт ключ в raid_backpack_op тем же оператором — повтор строку
//     ключа найдёт и заряды второй раз не прибавит;
//   • трата идёт ТОЛЬКО следом за удалённой строкой книги — повтор строки уже
//     не найдёт и второй заряд не спишет.
// Изменяющие CTE — верхним уровнем (без wrapJson), JSON ответа собираем сами.
// Комментарии внутри SQL — только блочные.
import { sqlStr } from "@/server/api/raid-shared";
import { OBLIVION_LV_KIND, OBLIVION_LVT_KIND, OBLIVION_TIME_KIND } from "@/lib/hero/boostOblivion";
import { oblivionRollMode } from "@/lib/hero/oblivionRule";

const LV = sqlStr(OBLIVION_LV_KIND);
const LVT = sqlStr(OBLIVION_LVT_KIND);
const TIME = sqlStr(OBLIVION_TIME_KIND);
/** Срок вечных зарядов: они не истекают, их только тратят. */
const FOREVER = "'9999-12-31 00:00:00+00'::timestamptz";
/** Повтор складывает заряды — только живые: у истёкшей строки остаток сгорел. */
const CARRY =
  "CASE WHEN e.expires_at > now() THEN GREATEST(e.value, 0) ELSE 0 END + EXCLUDED.value";
/** Повтор продлевает остаток (истёк — от «сейчас»): то же правило, что у дебаффов. */
const EXTEND = "GREATEST(e.expires_at, now()) + (EXCLUDED.expires_at - now())";

export const oblivionLockSql = (account: string): string =>
  `SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`oblivion:${account}`)})) AS l;`;

/** Живые строки аккаунта: заряды, заряды со сроком, безлимит. */
export const oblivionStateSql = (account: string): string =>
  `SELECT kind, value, expires_at FROM yuplink.beta_raid_player_effects
    WHERE account_id = ${sqlStr(account)} AND kind IN (${LV}, ${LVT}, ${TIME})
      AND expires_at > now();`;

/**
 * Выдать бросок: заряды (minutes = 0), заряды со сроком или безлимит на время
 * (level = 0). Заряды прибавляются к живым, срок продлевает остаток — то же
 * правило, что у дебаффов и иммунитета (applyPlayerEffect). Пустой бросок —
 * null: выдавать нечего. Ответ: `fresh` — ключ занят этим вызовом (иначе это
 * повтор уже выданного).
 */
export function oblivionGrantSql(o: {
  id: string;
  account: string;
  level: number;
  minutes: number;
  ref: string;
  source: string | null;
}): string | null {
  const mode = oblivionRollMode(o.level, o.minutes);
  if (!mode) return null;
  const src = o.source ? sqlStr(o.source.slice(0, 80)) : "NULL";
  const kind = mode === "lv" ? LV : mode === "lvt" ? LVT : TIME;
  const value = mode === "time" ? 1 : Math.max(1, Math.floor(o.level));
  const until =
    mode === "lv" ? FOREVER : `now() + interval '${Math.max(1, Math.floor(o.minutes))} minutes'`;
  const upd =
    mode === "lv"
      ? `value = ${CARRY}, expires_at = EXCLUDED.expires_at`
      : mode === "lvt"
        ? `value = ${CARRY}, expires_at = ${EXTEND}`
        : `value = 1, expires_at = ${EXTEND}`;
  return `${oblivionLockSql(o.account)}
    WITH mark AS (
      INSERT INTO yuplink.raid_backpack_op (op) VALUES (${sqlStr(o.ref)})
      ON CONFLICT (op) DO NOTHING
      RETURNING 1
    ),
    put AS (
      INSERT INTO yuplink.beta_raid_player_effects AS e
        (id, account_id, kind, value, expires_at, created_at, source)
      SELECT ${sqlStr(o.id)}, ${sqlStr(o.account)}, ${kind}, ${value}, ${until},
             now(), ${src}
        FROM mark
      ON CONFLICT (account_id, kind) WHERE kind NOT LIKE 'buff_%' DO UPDATE
        SET ${upd}, source = COALESCE(EXCLUDED.source, e.source)
      RETURNING 1
    )
    SELECT row_to_json(_t.*) AS _row FROM (
      SELECT EXISTS (SELECT 1 FROM mark) AS fresh, EXISTS (SELECT 1 FROM put) AS put
    ) _t;`;
}

/**
 * Забыть заклинание эффектом. Строка книги уходит, только если висит безлимит
 * или есть живой заряд. Тратится по порядку: безлимит — ничего; иначе заряд со
 * сроком (истёкший не в счёт); иначе вечный. Заряд уходит, только если строка
 * книги правда ушла: последний — строка эффекта удаляется (эффект снят),
 * больше — минус один. Герой обязан быть этого аккаунта. Откат (hero_spell_cd)
 * не трогаем.
 */
export function oblivionForgetSql(account: string, heroId: string, spellId: string): string {
  const acc = sqlStr(account);
  const spell = sqlStr(spellId);
  const charges = (kind: string) =>
    `SELECT id, value FROM yuplink.beta_raid_player_effects
       WHERE account_id = ${acc} AND kind = ${kind} AND value > 0 AND expires_at > now()`;
  return `${oblivionLockSql(account)}
    WITH own AS (
      SELECT h.id, h.rarity, t.specialization AS spec
        FROM yuplink.hero_instance h
        LEFT JOIN yuplink.mystic_item_template t ON t.id = h.template_id
       WHERE h.id = ${sqlStr(heroId)} AND h.account_id = ${acc}
    ),
    book AS (
      SELECT b.spell_id FROM yuplink.hero_spellbook b JOIN own ON b.hero_id = own.id
       WHERE b.spell_id = ${spell}
    ),
    tm AS (
      SELECT 1 AS x FROM yuplink.beta_raid_player_effects
       WHERE account_id = ${acc} AND kind = ${TIME} AND expires_at > now()
    ),
    lvt AS (${charges(LVT)}),
    lv AS (${charges(LV)}),
    pick AS (
      SELECT id, value FROM lvt WHERE NOT EXISTS (SELECT 1 FROM tm)
      UNION ALL
      SELECT id, value FROM lv
       WHERE NOT EXISTS (SELECT 1 FROM tm) AND NOT EXISTS (SELECT 1 FROM lvt)
    ),
    gone AS (
      DELETE FROM yuplink.hero_spellbook b USING own
       WHERE b.hero_id = own.id AND b.spell_id = ${spell}
         AND (EXISTS (SELECT 1 FROM tm) OR EXISTS (SELECT 1 FROM pick))
      RETURNING b.spell_id
    ),
    spent AS (
      UPDATE yuplink.beta_raid_player_effects e SET value = e.value - 1
        FROM pick
       WHERE e.id = pick.id AND pick.value > 1 AND EXISTS (SELECT 1 FROM gone)
      RETURNING 1
    ),
    dropped AS (
      DELETE FROM yuplink.beta_raid_player_effects e USING pick
       WHERE e.id = pick.id AND pick.value <= 1 AND EXISTS (SELECT 1 FROM gone)
      RETURNING 1
    )
    SELECT row_to_json(_t.*) AS _row FROM (
      SELECT EXISTS (SELECT 1 FROM own) AS own,
             (SELECT rarity FROM own) AS rarity, (SELECT spec FROM own) AS spec,
             EXISTS (SELECT 1 FROM book) AS inbook,
             EXISTS (SELECT 1 FROM tm) AS timed,
             COALESCE((SELECT max(value) FROM pick), 0) AS level,
             (SELECT count(*) FROM gone)::int AS gone,
             ((SELECT count(*) FROM spent) + (SELECT count(*) FROM dropped))::int AS spent,
             (SELECT count(*) FROM yuplink.hero_spellbook b JOIN own ON b.hero_id = own.id)::int
               AS used
    ) _t;`;
}
