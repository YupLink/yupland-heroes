// Запросы наград за друзей (yuplink.ref_reward, миграция ref-01): список «ждёт
// получения» и клейм. Клейм — ОДИН запрос: CAS pending → claimed и выдача вместе.
// Обрыв связи посередине невозможен — либо строка забрана и добро у игрока,
// либо ничего не изменилось. Повтор видит «claimed» и ничего не выдаёт.
import { sqlStr } from "./raid-shared";

/** Вид движения счёта: 10 % с подписки друга (на счёт, сразу к выводу). */
export const REF_SUB_ACC_KIND = "ref_sub";

export type RefRewardKind = "box" | "usdt";

export type RefRewardDb = {
  id: string;
  kind: RefRewardKind;
  status: "pending" | "claimed";
  milestone: number | null;
  pack_id: string | null;
  token: string | null;
  amount: string | number;
  created_at: string;
  pack_name?: string | null;
  pack_image?: string | null;
};

/** Неполученные награды аккаунта — для «Друзей» и точки в профиле. */
export const pendingRewardsSql = (account: string) => `
SELECT r.id, r.kind, r.status, r.milestone, r.pack_id, r.token, r.amount::text AS amount,
       r.created_at, p.name AS pack_name, p.cover_image_url AS pack_image
  FROM yuplink.ref_reward r
  LEFT JOIN yuplink.chip_packs p ON p.id = r.pack_id
 WHERE r.account_id = ${sqlStr(account)} AND r.status = 'pending'
 ORDER BY r.created_at, r.milestone NULLS LAST
 LIMIT 200`;

/** Одна строка аккаунта (любой статус) — клейм решает, что с ней делать. */
export const rewardRowSql = (account: string, id: string) => `
SELECT id, kind, status, milestone, pack_id, token, amount::text AS amount, created_at
  FROM yuplink.ref_reward
 WHERE id = ${sqlStr(id)} AND account_id = ${sqlStr(account)}`;

/**
 * Бокс: строка → claimed и пак в инвентарь (chip_pack_grants, source 'referral' —
 * не «покупка», друга-рефера не засчитывает). packId — уже с подменой
 * исчерпанного пака (chips-pack-fallback), как у бокса подписки.
 */
export function claimBoxSql(o: {
  account: string;
  id: string;
  wallet: string;
  packId: string;
}): string {
  return `
WITH c AS (
  UPDATE yuplink.ref_reward SET status = 'claimed', claimed_at = now()
   WHERE id = ${sqlStr(o.id)} AND account_id = ${sqlStr(o.account)}
     AND kind = 'box' AND status = 'pending'
  RETURNING id, account_id
), g AS (
  INSERT INTO yuplink.chip_pack_grants
    (id, account_id, wallet, chip_pack_id, source, source_ref, granted_at, tickets_spent)
  SELECT 'cpg_' || substr(md5('refbox:' || c.id), 1, 10), c.account_id, ${sqlStr(o.wallet)},
         ${sqlStr(o.packId)}, 'referral', 'refbox:' || c.id, now(), 0
    FROM c
  RETURNING id
)
SELECT row_to_json(_t.*) AS _row FROM (
  SELECT (SELECT count(*) FROM c)::int AS claimed, (SELECT id FROM g LIMIT 1) AS grant_id
) _t;`;
}

/**
 * USDT: строка → claimed и зачисление на счёт (acc_move, ключ 'refsub:<id>').
 * acc_move упал — откатывается весь запрос, строка остаётся «ждёт».
 */
export function claimUsdtSql(o: { account: string; id: string; wallet: string }): string {
  return `
WITH c AS (
  UPDATE yuplink.ref_reward SET status = 'claimed', claimed_at = now()
   WHERE id = ${sqlStr(o.id)} AND account_id = ${sqlStr(o.account)}
     AND kind = 'usdt' AND status = 'pending'
  RETURNING id, account_id, token, amount
), m AS MATERIALIZED (
  SELECT a.applied, a.balance
    FROM c, LATERAL yuplink.acc_move(c.account_id, c.token, c.amount, '${REF_SUB_ACC_KIND}',
                                     'refsub:' || c.id, ${sqlStr(o.wallet)}) a
)
SELECT row_to_json(_t.*) AS _row FROM (
  SELECT (SELECT count(*) FROM c)::int AS claimed,
         (SELECT bool_and(applied) FROM m) AS applied,
         (SELECT max(balance) FROM m)::text AS balance
) _t;`;
}

/** Ответ моста бывает `[{_row}]` или сразу `[{…}]` — разворачиваем обе формы. */
export function firstRow<T>(rows: unknown): T | null {
  const raw = (rows as Array<Record<string, unknown>> | null)?.[0];
  if (!raw || typeof raw !== "object") return null;
  return ("_row" in raw ? raw._row : raw) as T;
}
