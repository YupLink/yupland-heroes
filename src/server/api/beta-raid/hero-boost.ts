// Ключи нажатий на буст: защита от слепого повтора моста.
//
// Сам бафф живёт временно и на игроке (hero-buff.ts, beta_raid_player_effects).
// Здесь только журнал операций: повтор одного и того же нажатия читает уже
// записанную строку и НЕ вешает бафф второй раз — иначе алтарь за одну оплату
// раздавал бы двойной бонус.
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { BoostStat } from "@/lib/hero/boost";

/**
 * Занять ключ операции. Вернёт false, если этот `op` занял КТО-ТО РАНЬШЕ —
 * значит, нажатие повторилось и платить/начислять больше нечего.
 *
 * ⚠️ Почему не `ON CONFLICT DO NOTHING RETURNING`: мост к базе повторяет
 * запись вслепую (mcpClient, «КОНТРАКТ РЕТРАЯ»). Первая попытка строку
 * вставляла, ответ терялся, повтор упирался в свою же строку и отдавал ноль —
 * код читал это как «уже нажимали» и молча съедал нажатие: у каста это откат
 * на четыре часа без эффекта и без списанной энергии.
 *
 * Лечение то же, что у квитанций ввода NFT (chips-mint-deposit-receipt.ts):
 * пишем СВОЮ метку и `DO UPDATE SET ... = <старая>`, чтобы RETURNING отдавал
 * строку всегда и было видно, чья она. Метку кладём в `source` — колонка
 * только пишется (её никто не читает, кроме разбора жалоб), и отдельная
 * колонка ради этого потребовала бы миграции живой таблицы.
 */
export async function claimBoostOp(opts: {
  op: string;
  heroId: string;
  stat: BoostStat;
  amount: number;
  source: string;
}): Promise<boolean> {
  // Метка своя на КАЖДЫЙ вызов: повтор транспорта шлёт тот же SQL и узнаёт
  // себя, а второй заход того же `op` из браузера — уже нет.
  const mark = `${opts.source}#${nanoid(10)}`;
  const rows = (await mcpExec(
    `INSERT INTO yuplink.hero_boost_op AS b (op, hero_id, stat, amount, source)
     VALUES (${sqlStr(opts.op)}, ${sqlStr(opts.heroId)}, ${sqlStr(opts.stat)},
             ${opts.amount}, ${sqlStr(mark)})
     ON CONFLICT (op) DO UPDATE SET source = b.source
     RETURNING b.source AS source;`,
    { wrapJsonCte: true },
  )) as Array<{ source: string | null }>;
  return rows?.[0]?.source === mark;
}

/** Снять занятый ключ — оплата не прошла, начисления не будет. */
export async function releaseBoostOp(op: string): Promise<void> {
  await mcpExec(`DELETE FROM yuplink.hero_boost_op WHERE op = ${sqlStr(op)};`).catch(() => {});
}

/** Что уже начислили по этому ключу (для ответа на повторное нажатие). */
export async function boostOpAmount(op: string): Promise<number> {
  const rows = (await mcpExec(
    `SELECT amount::float8 AS amount FROM yuplink.hero_boost_op WHERE op = ${sqlStr(op)} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ amount: number }>;
  return Number(rows?.[0]?.amount ?? 0);
}
