// Ключи одного нажатия «Изготовить» (craft.ts) и они же в SQL для добора
// (blueprint-sweep.ts): оплата — castle_architect_op.op_id, выдача в рюкзак —
// raid_backpack_op.op (depositToBackpack пишет `bp:${nonce}`). Формулы обязаны
// совпадать: добор, искавший не тот ключ выдачи, вернул бы оплату поверх
// выданной заготовки. Здесь же возраст оплаты, с которого её берёт добор:
// по нему изготовление решает, мог ли добор успеть к его ключу (craft-core.ts).

/** Добор берёт оплаты старше стольких минут — дальше любой живой выдачи. */
export const SWEEP_AFTER_MIN = 10;

/** Ключ оплаты (castle_architect_pay p_op). */
export function payOpOf(account: string, opId: string): string {
  return `bp:${account}:${opId}`;
}

/** nonce выдачи в рюкзак (depositToBackpack): id ячейки и ключ операции. */
export function depositNonceOf(account: string, opId: string): string {
  return `archbp_${account}_${opId}`;
}

/** Ключ выдачи в raid_backpack_op — ровно то, что пишет depositToBackpack. */
export function depositOpOf(account: string, opId: string): string {
  return `bp:${depositNonceOf(account, opId)}`;
}

/**
 * Строка `o` таблицы castle_architect_op — оплата нажатия своего аккаунта
 * (op_id = payOpOf(account_id, opId)). Префикс сверяется по длине, а не LIKE:
 * `_` и `%` в id аккаунта не шаблон.
 */
export const PAY_OP_SHAPE_SQL = `left(o.op_id, length(o.account_id) + 4) = 'bp:' || o.account_id || ':'`;

/** depositOpOf той же строки `o`: opId — хвост op_id после 'bp:<account>:'. */
export const DEPOSIT_OP_OF_ROW_SQL = `'bp:archbp_' || o.account_id || '_' || substr(o.op_id, length(o.account_id) + 5)`;
