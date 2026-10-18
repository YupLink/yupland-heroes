// Аккаунт-балансы (единая таблица yuplink.account_balances). Фунгиблы лайки/
// энергия/билеты живут на АККАУНТЕ (account_id), а не на кошельке — отвязал кош,
// баланс остаётся. Кош резолвится в account_id через users.account_id.
import { pg } from "./db/pg";
import { mcpExec } from "./db/mcpClient";

/** account_id кошелька (или null, если кош не в users). */
export async function getAccountId(wallet: string): Promise<string | null> {
  const u = await pg.users.findOne({ wallet });
  return (u as { account_id?: string | null } | null)?.account_id ?? null;
}

/** Гарантирует строку account_balances для аккаунта. */
async function ensureRow(accountId: string): Promise<void> {
  await mcpExec(
    `INSERT INTO yuplink.account_balances(account_id) VALUES('${accountId.replace(/'/g, "''")}') ON CONFLICT (account_id) DO NOTHING;`
  );
}

/** Баланс лайков аккаунта (по кошельку). */
export async function getAccountLikes(wallet: string): Promise<number> {
  const acc = await getAccountId(wallet);
  if (!acc) return 0;
  const r = (await mcpExec(
    `SELECT likes FROM yuplink.account_balances WHERE account_id='${acc.replace(/'/g, "''")}';`,
    { wrapJson: true }
  )) as Array<{ likes: number }>;
  return Math.round(Number(r[0]?.likes ?? 0) * 100) / 100;
}

/** Записать (перезаписать) баланс лайков аккаунта в единую таблицу. Для
 *  write-through зеркала: значение уже посчитано в источнике (user_like_balance),
 *  сюда кладётся актуальный итог. Fire-and-forget-совместимо. */
export async function setAccountLikes(
  wallet: string,
  likes: number
): Promise<void> {
  const acc = await getAccountId(wallet);
  if (!acc) return;
  const v = Math.round(Number(likes) * 100) / 100;
  await mcpExec(
    `INSERT INTO yuplink.account_balances(account_id, likes) VALUES('${acc.replace(/'/g, "''")}', ${v})
     ON CONFLICT (account_id) DO UPDATE SET likes=${v}, updated_at=now();`
  );
}

/** Снапшот энергии аккаунта в единую таблицу. Источник-правда — user_energy/
 *  compute_energy (с реген-логикой); сюда кладётся текущее значение для показа. */
export async function setAccountEnergy(
  wallet: string,
  energy: number
): Promise<void> {
  const acc = await getAccountId(wallet);
  if (!acc) return;
  const v = Math.round(Number(energy) * 100) / 100;
  await mcpExec(
    `INSERT INTO yuplink.account_balances(account_id, energy, energy_updated_at) VALUES('${acc.replace(/'/g, "''")}', ${v}, now())
     ON CONFLICT (account_id) DO UPDATE SET energy=${v}, energy_updated_at=now(), updated_at=now();`
  );
}

/** Начислить лайки на аккаунт (атомарный инкремент). Возвращает новый баланс. */
export async function creditAccountLikes(
  wallet: string,
  amount: number,
  opts?: { grant?: number; purchased?: number }
): Promise<number> {
  const acc = await getAccountId(wallet);
  if (!acc) return 0;
  await ensureRow(acc);
  const r = (await mcpExec(
    `UPDATE yuplink.account_balances
       SET likes = likes + ${Number(amount)},
           lifetime_granted = lifetime_granted + ${Number(opts?.grant ?? 0)},
           lifetime_purchased = lifetime_purchased + ${Number(opts?.purchased ?? 0)},
           updated_at = now()
     WHERE account_id='${acc.replace(/'/g, "''")}' RETURNING likes;`,
    { wrapJsonCte: true }
  )) as Array<{ likes: number }>;
  return Math.round(Number(r[0]?.likes ?? 0) * 100) / 100;
}
