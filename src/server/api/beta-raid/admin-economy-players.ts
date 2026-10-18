// Игроки: балансы всех валют и ресурсов + кастом-товары в рюкзаке/на складе.
//
// Одна таблица с колонкой на валюту. Топ-N режем в вызывающем — здесь
// возвращается всё, а сортировкой правит клиент. Мешать топ и «показать всех»
// на бэке дорого: клиент сам решает, какую сумму брать за метрику.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { PlayerBalance, PlayerRow } from "./admin-economy-types";
import { keyFromStackKey } from "./admin-economy-keys";

type BalRow = {
  account_id: string;
  telegram_id: number | string | null;
  telegram_username: string | null;
  likes: number | string | null;
  tickets: number | string | null;
  last_active: string | null;
};

type AccRow = {
  account_id: string;
  token: string;
  bal: number | string;
};

type ResRow = {
  account_id: string;
  resource: string;
  amount: number | string;
};

type StackRow = {
  account_id: string;
  stack_key: string;
  kind: string;
  ref_id: string | null;
  name: string;
  total: number | string;
};

/**
 * Собрать игроков со всеми ресурсами. Не режем: сортировку и «топ-20 → все»
 * решает клиент — иначе пришлось бы делать N запросов по валютам.
 */
export async function buildPlayers(): Promise<{ players: PlayerRow[]; currencies: string[] }> {
  const [bal, acc, res, wh, bp] = await Promise.all([
    fetchBase(),
    fetchAcc(),
    fetchRes(),
    fetchStacks("yuplink.raid_warehouse_slot", "owner_account"),
    fetchStacks("yuplink.raid_hero_backpack", "account_id"),
  ]);

  const byAcc = new Map<string, PlayerRow>();
  const ensure = (a: BalRow): PlayerRow => {
    const found = byAcc.get(a.account_id);
    if (found) return found;
    const tg = a.telegram_id != null ? Number(a.telegram_id) : null;
    const uname = a.telegram_username ?? null;
    const created: PlayerRow = {
      accountId: a.account_id,
      displayName: uname ? `@${uname}` : tg ? `tg${tg}` : `acc:${a.account_id.slice(0, 6)}`,
      telegramId: tg && Number.isFinite(tg) ? tg : null,
      telegramUsername: uname,
      balances: [],
      lastActive: a.last_active ?? null,
    };
    // Лайки/билеты — из account_balances (write-through зеркала лежат тут).
    const likes = Number(a.likes ?? 0);
    const tickets = Number(a.tickets ?? 0);
    if (likes) created.balances.push({ currency: "likes", amount: likes });
    if (tickets) created.balances.push({ currency: "tickets", amount: tickets });
    byAcc.set(a.account_id, created);
    return created;
  };

  for (const b of bal) ensure(b);
  const addBal = (accId: string, currency: string, amount: number) => {
    if (!amount) return;
    // Игрока могло не быть в base: fresh-аккаунт без строки account_balances.
    // Создаём минимальную запись, чтобы не потерять.
    const row =
      byAcc.get(accId) ??
      ensure({
        account_id: accId,
        telegram_id: null,
        telegram_username: null,
        likes: 0,
        tickets: 0,
        last_active: null,
      });
    const found = row.balances.find((x) => x.currency === currency);
    if (found) found.amount += amount;
    else row.balances.push({ currency, amount });
  };

  for (const a of acc) addBal(a.account_id, `token:${a.token}`, Number(a.bal) || 0);
  for (const r of res) addBal(r.account_id, r.resource, Number(r.amount) || 0);
  for (const s of wh) {
    const key = keyFromStackKey(s.stack_key, s.kind, s.ref_id, s.name);
    if (!key) continue;
    addBal(s.account_id, key, Number(s.total) || 0);
  }
  for (const s of bp) {
    const key = keyFromStackKey(s.stack_key, s.kind, s.ref_id, s.name);
    if (!key) continue;
    addBal(s.account_id, key, Number(s.total) || 0);
  }

  // Список валют — все, что реально встретились. Клиент сам решит порядок и
  // формат подписей: у него уже есть словари ресурсов и токенов.
  const currencies = new Set<string>(["likes", "tickets"]);
  for (const p of byAcc.values()) for (const b of p.balances) currencies.add(b.currency);

  // Сортировка «по активности» по умолчанию — верх выборки будет как «активные
  // сегодня»; таблица клиента переопределяет свой ключ.
  const players = [...byAcc.values()].sort((a, b) => {
    const ta = a.lastActive ? Date.parse(a.lastActive) : 0;
    const tb = b.lastActive ? Date.parse(b.lastActive) : 0;
    return tb - ta;
  });
  return { players, currencies: [...currencies] };
}

async function fetchBase(): Promise<BalRow[]> {
  // Аккаунтов немного (сотни), TG-имя — со связки users по account_id.
  // last_active берём из ledger max за 30д — там всегда пишется реальный игрок.
  const rows = (await mcpExec(
    `SELECT a.id AS account_id, a.telegram_id,
            (SELECT max(u.telegram_username) FROM yuplink.users u
              WHERE u.account_id = a.id AND u.telegram_username IS NOT NULL) AS telegram_username,
            b.likes, b.tickets,
            (SELECT max(l.created_at)::text FROM yuplink.acc_ledger l
              WHERE l.account_id = a.id
                AND l.created_at >= now() - interval '30 days') AS last_active
       FROM yuplink.accounts a
       LEFT JOIN yuplink.account_balances b ON b.account_id = a.id;`,
    { wrapJson: true },
  ).catch(() => [])) as BalRow[];
  return rows ?? [];
}

async function fetchAcc(): Promise<AccRow[]> {
  // Балансы токенов на счёте — SUM(delta) по account_id/token.
  const rows = (await mcpExec(
    `SELECT account_id, token, sum(delta)::numeric AS bal
       FROM yuplink.acc_ledger GROUP BY account_id, token HAVING sum(delta) <> 0;`,
    { wrapJson: true },
  ).catch(() => [])) as AccRow[];
  return rows ?? [];
}

async function fetchRes(): Promise<ResRow[]> {
  const rows = (await mcpExec(
    `SELECT account_id, resource, amount FROM yuplink.account_resources WHERE amount <> 0;`,
    { wrapJson: true },
  ).catch(() => [])) as ResRow[];
  return rows ?? [];
}

async function fetchStacks(table: string, accCol: string): Promise<StackRow[]> {
  // Общие ячейки склада (owner_account NULL) на конкретного игрока не относим —
  // их видит любой. Личные легко атрибутируются.
  const rows = (await mcpExec(
    `SELECT ${accCol} AS account_id, stack_key, min(kind) AS kind,
            min(ref_id) AS ref_id, min(name) AS name, sum(count)::numeric AS total
       FROM ${table} WHERE count > 0 AND ${accCol} IS NOT NULL
      GROUP BY ${accCol}, stack_key;`,
    { wrapJson: true },
  ).catch(() => [])) as StackRow[];
  return rows ?? [];
}
