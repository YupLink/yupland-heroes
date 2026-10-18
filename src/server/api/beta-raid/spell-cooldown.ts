// ОТКАТ заклинания: занять, вернуть, посмотреть.
//
// Ключ — hero_instance. У каждого героя своя книга и свои откаты: если
// один герой прочёл «Призвать корабль», это не занимает откат у другого.
// Раньше кулдаун лежал на АККАУНТЕ (энергия и эффекты общие) — оказалось,
// это ломает ожидание игрока «независимые герои — независимые заклинания»,
// владелец 14.09 попросил вернуть per-hero.
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { spellReadyAt } from "./spell-book";

/** Прошлое состояние отката: нужно, чтобы вернуть его при сорвавшемся касте. */
type PrevCd = { usedAt: string; readyAt: string } | null;

/**
 * Занять откат ОДНИМ оператором. Ключ строки — (hero_id, spell_id).
 *
 * ⚠️ Про CAS: строка помечается НАШЕЙ меткой (op), ветвление ушло в CASE,
 * RETURNING отдаёт строку всегда — повтор моста узнаёт собственную метку и
 * продолжает каст, чужое нажатие видит чужую и честно ждёт (приём из
 * chips-mint-deposit-receipt.ts).
 *
 * Момент готовности считаем ЗДЕСЬ и записываем абсолютным (ready_at): скидка
 * от интеллекта фиксируется в миг каста и потом не пересматривается.
 */
export async function takeCooldown(
  heroId: string,
  spellId: string,
  minutes: number,
): Promise<{ taken: boolean; readyAt: string | null; prev: PrevCd }> {
  const ready = `now() + interval '1 minute' * ${Math.max(0, Math.floor(minutes))}`;
  // Метка своя на КАЖДЫЙ вызов: повтор транспорта шлёт тот же SQL с той же
  // меткой, а второе нажатие из браузера придёт со своей.
  const mark = `cd_${nanoid(10)}`;
  const rows = (await mcpExec(
    `WITH prev AS (
       SELECT used_at, ready_at, op FROM yuplink.hero_spell_cd
        WHERE hero_id = ${sqlStr(heroId)} AND spell_id = ${sqlStr(spellId)}
     ), took AS (
       INSERT INTO yuplink.hero_spell_cd AS cd (hero_id, spell_id, used_at, ready_at, op)
       VALUES (${sqlStr(heroId)}, ${sqlStr(spellId)}, now(), ${ready}, ${sqlStr(mark)})
       ON CONFLICT ON CONSTRAINT hero_spell_cd_pk DO UPDATE
          SET used_at  = CASE WHEN cd.ready_at <= now() THEN now() ELSE cd.used_at END,
              ready_at = CASE WHEN cd.ready_at <= now() THEN ${ready} ELSE cd.ready_at END,
              op       = CASE WHEN cd.ready_at <= now() THEN ${sqlStr(mark)} ELSE cd.op END
       RETURNING ready_at, op
     )
     SELECT (SELECT op FROM took) AS took_op,
            (SELECT ready_at::text FROM took) AS new_ready,
            (SELECT used_at::text FROM prev) AS prev_used,
            (SELECT ready_at::text FROM prev) AS prev_ready,
            (SELECT op FROM prev) AS prev_op;`,
    { wrapJson: false },
  )) as Array<{
    took_op: string | null;
    new_ready: string | null;
    prev_used: string | null;
    prev_ready: string | null;
    prev_op: string | null;
  }>;
  const row = rows?.[0];
  const mine = row?.prev_op === mark;
  return {
    taken: row?.took_op === mark,
    readyAt: row?.new_ready ?? null,
    prev:
      !mine && row?.prev_used && row?.prev_ready
        ? { usedAt: row.prev_used, readyAt: row.prev_ready }
        : null,
  };
}

/** Вернуть откат: каст не состоялся, ждать игроку не за что. */
export async function restoreCooldown(
  heroId: string,
  spellId: string,
  prev: PrevCd,
): Promise<void> {
  const where = `WHERE hero_id = ${sqlStr(heroId)} AND spell_id = ${sqlStr(spellId)}`;
  await mcpExec(
    prev
      ? `UPDATE yuplink.hero_spell_cd
            SET used_at = ${sqlStr(prev.usedAt)}::timestamptz,
                ready_at = ${sqlStr(prev.readyAt)}::timestamptz ${where};`
      : `DELETE FROM yuplink.hero_spell_cd ${where};`,
  ).catch((e) => console.error("[spell] откат не вернулся:", heroId, spellId, e));
}

/** Когда заклинание снова готово — для ответа на повторное нажатие. */
export async function readyAtOf(heroId: string, spellId: string): Promise<string | null> {
  return (await spellReadyAt(heroId)).get(spellId) ?? null;
}
