// Лайки принадлежат аккаунту, а не кошельку.
//
// Раньше строка баланса ключевалась адресом, а «единство игрока» изображали
// двумя костылями: стягиванием остатков с кошельков-сестёр (consolidate_like_
// balance) и проверкой «не получала ли сестра дневной грант». Оба существовали
// только потому, что у одного игрока было несколько строк. Ключ по аккаунту
// убирает и причину, и костыли: строка ровно одна, и она есть даже у игрока
// без единого кошелька.
import { pg, type PgUserLikeBalance } from "./db/pg";
import { mcpExec } from "./db/mcpClient";

/** Ключ владения из чего угодно: аккаунт вернётся как есть, адрес — переведётся. */
export async function likeAccountId(key: string): Promise<string> {
  if (key.startsWith("acc_")) {
    const acc = await pg.accounts.findOne({ id: key });
    if (acc) return key;
  }
  const u = await pg.users.findOne({ wallet: key });
  if (u?.account_id) return u.account_id;
  // Аккаунт есть у каждого входа (см. ПРАВИЛА.md, «Игрок = аккаунт»), поэтому
  // сюда попадает только неизвестный ключ — молчать нельзя, иначе баланс уедет
  // в никуда.
  throw new Error(`Нет аккаунта для ключа ${key}`);
}

/** Тот же резолв для SQL-строк, где на руках только адрес. */
export const accOfSql = (key: string): string =>
  `yuplink.acc_of('${key.replace(/'/g, "''")}')`;

/** Пустая строка баланса аккаунта. */
export function emptyLikeRow(accountId: string): PgUserLikeBalance {
  return {
    account_id: accountId,
    wallet: null,
    available: 0,
    last_daily_grant_at: null,
    lifetime_granted: 0,
    lifetime_purchased: 0,
    lifetime_spent: 0,
    updated_at: new Date().toISOString(),
  };
}

/** Прочитать (и при надобности завести) баланс аккаунта. */
export async function likeRow(accountId: string): Promise<PgUserLikeBalance> {
  const found = await pg.userLikeBalance.findOne({ account_id: accountId });
  if (found) return found;
  const row = emptyLikeRow(accountId);
  try {
    await pg.userLikeBalance.insert(row);
    return row;
  } catch {
    // Гонка: строку успел завести параллельный запрос.
    return (await pg.userLikeBalance.findOne({ account_id: accountId })) ?? row;
  }
}

/**
 * Атомарно прибавить лайки аккаунту. Read-modify-write здесь недопустим:
 * начисления идут пачками параллельно и затирали бы друг друга.
 *
 * `ref` — ключ повтора. Мост к БД ретраит запрос вслепую до четырёх раз, и
 * если ответ потерялся уже ПОСЛЕ выполнения, повтор начислил бы лайки второй
 * раз. С ключом начисление проходит ровно один раз: лог ссылок (like_grant_log)
 * играет ту же роль, что ticket_move для билетов.
 */
export async function addLikes(
  accountId: string,
  delta: number,
  field: "lifetime_granted" | "lifetime_purchased" = "lifetime_granted",
  ref?: string,
): Promise<void> {
  if (!(Number.isFinite(delta) && delta > 0)) return;
  const acc = accountId.replace(/'/g, "''");
  const d = Number(delta);
  const gr = field === "lifetime_granted" ? d : 0;
  const pu = field === "lifetime_purchased" ? d : 0;
  const body = `
    INSERT INTO yuplink.user_like_balance
      (account_id, available, last_daily_grant_at,
       lifetime_granted, lifetime_purchased, lifetime_spent, updated_at)
    SELECT '${acc}', ${d}, NULL, ${gr}, ${pu}, 0, now()`;
  const tail = `
    ON CONFLICT (account_id) DO UPDATE
      SET available = yuplink.user_like_balance.available + EXCLUDED.available,
          ${field} = yuplink.user_like_balance.${field} + EXCLUDED.${field},
          updated_at = now()`;
  if (!ref) {
    await mcpExec(`${body}${tail}`);
    return;
  }
  const r = ref.replace(/'/g, "''").slice(0, 180);
  // Строка баланса вставляется только если ссылка легла в лог первой:
  // повтор того же ref даёт пустой CTE и ноль изменений.
  await mcpExec(`
    WITH claim AS (
      INSERT INTO yuplink.like_grant_log (ref, account_id, delta)
      VALUES ('${r}', '${acc}', ${d})
      ON CONFLICT (ref) DO NOTHING
      RETURNING 1
    )${body} FROM claim${tail}
  `);
}
