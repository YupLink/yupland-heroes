// Кто считается активным игроком — и куда ему писать.
//
// Отдельного «последнего входа» в игре нет, поэтому активность собираем по
// следам действий. Берём шесть источников, потому что игрок может целый день
// только воевать (энергия), только торговать (счёт) или только ходить по карте:
// одного признака мало, а вместе они покрывают всё, чем в игре можно заняться.
//
// Ключ — АККАУНТ, а не кошелёк: у одного человека их бывает несколько, и
// раздача «на каждый адрес» превратилась бы в раздачу «кто больше завёл».
//
// Telegram игрока берём не только из accounts.telegram_id: у игрока
// (20.09.2026) id стоял на пустом аккаунте-держателе, а играл он на другом —
// и две недели раздач прошли мимо. Кошельки (users) знают Telegram своего
// хозяина, поэтому смотрим и туда. Один Telegram — один подарок: если на него
// живут два аккаунта, берём тот, где id стоит в accounts, иначе тот, что
// шевелился последним.
import { mcpExec } from "../db/mcpClient";

export type ActivePlayer = {
  accountId: string;
  wallet: string | null;
  telegramId: number | null;
};

/**
 * Аккаунты, что подавали признаки жизни за последние `hours` часов.
 * `wallet` — адрес для начислений (канонический из accounts), может быть null
 * у игрока, вошедшего только через Telegram.
 */
export async function activeAccounts(hours: number): Promise<ActivePlayer[]> {
  const h = Math.max(1, Math.floor(hours));
  const rows = (await mcpExec(
    `WITH act AS (
       SELECT account_id, max(updated_at) AS at FROM yuplink.beta_raid_positions
        WHERE updated_at > now() - make_interval(hours => ${h}) GROUP BY 1
       UNION ALL SELECT account_id, max(created_at) FROM yuplink.currency_ledger
        WHERE created_at > now() - make_interval(hours => ${h})
          -- Начисленное админом и наградами — не признак жизни: игрок мог
          -- вчера получить подарок и с тех пор в игру не заходить. Таяние
          -- (energy_decay) — часы, а не действие игрока.
          AND kind NOT IN ('energy_admin', 'energy_reward', 'energy_tester',
                           'admin_grant', 'admin_fix', 'energy_decay') GROUP BY 1
       UNION ALL SELECT account_id, max(created_at) FROM yuplink.acc_ledger
        WHERE created_at > now() - make_interval(hours => ${h})
          AND kind NOT IN ('acc_reward', 'acc_adjust') GROUP BY 1
       UNION ALL SELECT account, max(created_at) FROM yuplink.ticket_ledger
        WHERE created_at > now() - make_interval(hours => ${h})
          -- Переносы и сверки делает админ, не игрок.
          AND kind NOT IN ('migration', 'reconcile') GROUP BY 1
       UNION ALL SELECT account_id, max(created_at) FROM yuplink.res_ledger
        WHERE created_at > now() - make_interval(hours => ${h}) GROUP BY 1
       -- Лайки берём по ТРАТАМ: дневной грант капает всем подряд, в том числе
       -- тем, кто не заходил, и «активными» становилась вся база.
       UNION ALL SELECT account_id, max(created_at) FROM yuplink.like_spend_log
        WHERE created_at > now() - make_interval(hours => ${h})
          AND reason <> 'merge_to_main' GROUP BY 1
     ), live AS (
       SELECT account_id, max(at) AS at FROM act GROUP BY 1
     ), known AS (
       SELECT a.id AS account_id, live.at,
              (a.telegram_id IS NOT NULL) AS anchored,
              COALESCE(a.telegram_id,
                (SELECT u.telegram_id FROM yuplink.users u
                  WHERE u.account_id = a.id AND u.telegram_id IS NOT NULL
                  ORDER BY u.telegram_id LIMIT 1)) AS telegram_id,
              (SELECT u.wallet FROM yuplink.users u
                WHERE u.account_id = a.id AND u.wallet IS NOT NULL
                ORDER BY u.wallet LIMIT 1) AS wallet
         FROM live
         JOIN yuplink.accounts a ON a.id = live.account_id
     )
     SELECT DISTINCT ON (telegram_id) account_id, telegram_id, wallet
       FROM known
      WHERE telegram_id IS NOT NULL
      ORDER BY telegram_id, anchored DESC, at DESC;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{
    account_id: string;
    telegram_id: number | string | null;
    wallet: string | null;
  }>;

  return (rows ?? []).map((r) => ({
    accountId: r.account_id,
    wallet: r.wallet,
    telegramId: r.telegram_id == null ? null : Number(r.telegram_id),
  }));
}
