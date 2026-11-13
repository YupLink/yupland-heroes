// Telegram-id аккаунта должен стоять на ТОМ аккаунте, в котором игрок играет.
//
// Как расходилось (жалоба игрока 20.09.2026): вход через Telegram заводил
// аккаунт A с telegram_id; подключение кошелька заводило аккаунт B без него;
// потом кошельки съезжали на B, а telegram_id оставался на пустом A
// (UNIQUE не даёт скопировать). Раздача подарков «активным с Telegram»
// (gifts-active) смотрит на accounts.telegram_id — и B, живой и играющий, в
// раздачу не попадал, а подарки копились на пустом A. Второй вариант проще:
// кошелёк подключили до Telegram, аккаунт B без telegram_id, держателя нет.
//
// Здесь — идемпотентная починка на входе: если держатель пуст (ни одного
// кошелька), id переезжает на аккаунт кошельков вместе с неполученными
// подарками; если держателя нет вовсе — id просто проставляется.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";

type IdRow = { id: string };
type PlayedRow = { account_id: string; n: number | string };

export async function adoptTelegramAccount(telegramId: number): Promise<void> {
  if (!Number.isFinite(telegramId) || telegramId <= 0) return;
  const tg = Math.floor(telegramId);
  const holder = (await mcpExec(
    `SELECT id FROM yuplink.accounts WHERE telegram_id = ${tg} LIMIT 1;`,
    { wrapJson: true },
  )) as IdRow[] | null;
  const played = (await mcpExec(
    `SELECT account_id, count(*) AS n FROM yuplink.users
      WHERE telegram_id = ${tg} AND account_id IS NOT NULL
      GROUP BY account_id ORDER BY n DESC LIMIT 2;`,
    { wrapJson: true },
  )) as PlayedRow[] | null;
  const target = played?.[0]?.account_id;
  if (!target) return;
  // Два аккаунта с кошельками на один Telegram — не наш случай, тут решает
  // человек (слияние балансов), а не вход.
  if ((played?.length ?? 0) > 1) return;
  const holderId = holder?.[0]?.id ?? null;
  if (holderId === target) return;
  if (holderId) {
    const used = (await mcpExec(
      `SELECT wallet AS id FROM yuplink.users WHERE account_id = ${sqlStr(holderId)} LIMIT 1;`,
      { wrapJson: true },
    )) as IdRow[] | null;
    // У держателя есть свои кошельки — это отдельный аккаунт, не трогаем.
    if (used && used.length > 0) return;
    await mcpExec(
      `UPDATE yuplink.accounts SET telegram_id = NULL WHERE id = ${sqlStr(holderId)} AND telegram_id = ${tg};
       UPDATE yuplink.accounts SET telegram_id = ${tg} WHERE id = ${sqlStr(target)} AND telegram_id IS NULL;
       UPDATE yuplink.player_gift SET account_id = ${sqlStr(target)}
        WHERE account_id = ${sqlStr(holderId)} AND status = 'pending';
       UPDATE yuplink.beta_raid_object_run SET account_id = ${sqlStr(target)}
        WHERE account_id = ${sqlStr(holderId)};
       DELETE FROM yuplink.beta_raid_positions WHERE account_id = ${sqlStr(holderId)};`,
      { wrapJson: false },
    );
    console.log(`[account-adopt] tg ${tg}: ${holderId} (пустой) → ${target}`);
    return;
  }
  await mcpExec(
    `UPDATE yuplink.accounts SET telegram_id = ${tg} WHERE id = ${sqlStr(target)} AND telegram_id IS NULL;`,
    { wrapJson: false },
  );
}
