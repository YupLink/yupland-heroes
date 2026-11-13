// Ввод промокода глазами базы: вызов promo_redeem (migrations/promo-01), разбор
// ответа и отметки выдачи. Чистые строители SQL — под тест без базы.
import { sqlStr } from "@/server/api/raid-shared";
import { isPromoKind, type PromoKind, type PromoWhere } from "@/lib/promo/promoTypes";

/** Строка, выпавшая при вводе: уже зарезервирована в объёме кода. */
export type RolledLine = {
  idx: number;
  kind: PromoKind;
  ref: string | null;
  title: string | null;
  image: string | null;
  amount: number;
};

/** used — тот же Telegram уже вводил код с другого аккаунта. */
export type RedeemError = "not_found" | "inactive" | "exhausted" | "used";

export type Redemption = {
  id: string;
  code: string;
  status: "reserved" | "done";
  /** Тот же ключ нажатия, что у записанной активации (повтор того же запроса). */
  sameOp: boolean;
  /** Аккаунт код уже вводил — это прежняя активация, не новая. */
  was: boolean;
  rolled: RolledLine[];
  /** Куда легла каждая строка (ключ — idx строкой); нет ключа — ещё не доехала. */
  delivered: Record<string, PromoWhere>;
};

export const redeemSql = (o: {
  code: string;
  account: string;
  wallet: string;
  op: string;
  /** Telegram аккаунта: одна активация кода на TG. */
  tg: number | null;
}) =>
  `SELECT yuplink.promo_redeem(${sqlStr(o.code)}, ${sqlStr(o.account)}, ${sqlStr(o.wallet)},
            ${sqlStr(o.op)}, ${tgSql(o.tg)}) AS res`;

/** Telegram числом в SQL; нет или мусор — NULL (проверка TG тогда не сработает). */
const tgSql = (tg: number | null): string =>
  tg != null && Number.isSafeInteger(Number(tg)) ? `${Number(tg)}::bigint` : "NULL";

const WHERE: ReadonlySet<string> = new Set(["balance", "backpack", "inventory", "harvest"]);
const ERRORS: ReadonlySet<string> = new Set(["not_found", "inactive", "exhausted", "used"]);

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** jsonb приходит объектом (прямой канал) или строкой JSON (мост). */
function jsonOf(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function rolledOf(v: unknown): RolledLine[] {
  const arr = jsonOf(v);
  if (!Array.isArray(arr)) return [];
  const out: RolledLine[] = [];
  for (const raw of arr) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const amount = Number(r.amount);
    if (!isPromoKind(r.kind) || r.kind === "nothing" || !(amount > 0)) continue;
    out.push({
      idx: Number(r.idx) || 0,
      kind: r.kind,
      ref: str(r.ref),
      title: str(r.title),
      image: str(r.image),
      amount,
    });
  }
  return out;
}

function deliveredOf(v: unknown): Record<string, PromoWhere> {
  const obj = jsonOf(v);
  const out: Record<string, PromoWhere> = {};
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const [k, w] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof w === "string" && WHERE.has(w)) out[k] = w as PromoWhere;
  }
  return out;
}

/** Ответ базы → отказ или активация; не разобрали — null (сбой, не «нет кода»). */
export function parseRedeem(rows: unknown): { error: RedeemError } | Redemption | null {
  const row = Array.isArray(rows) ? (rows[0] as { res?: unknown } | undefined) : undefined;
  const res = jsonOf(row?.res);
  if (!res || typeof res !== "object") return null;
  const o = res as Record<string, unknown>;
  if (typeof o.error === "string") {
    return ERRORS.has(o.error) ? { error: o.error as RedeemError } : null;
  }
  const id = str(o.id);
  if (!id) return null;
  return {
    id,
    code: str(o.code) ?? "",
    status: o.status === "done" ? "done" : "reserved",
    sameOp: o.same_op === true,
    was: o.was === true,
    rolled: rolledOf(o.rolled),
    delivered: deliveredOf(o.delivered),
  };
}

/**
 * Функции или таблиц ещё нет (код выкатили раньше миграции): для игрока это
 * «нового кода нет», и профиль спросит коды на лайки — старые не ломаются.
 */
export const isMissingSchema = (e: unknown): boolean =>
  /promo_redeem|promo_code/.test(String(e instanceof Error ? e.message : e)) &&
  /does not exist|не существует/i.test(String(e instanceof Error ? e.message : e));

/** Отметка «строка доехала сюда»: повторный ввод её уже не выдаёт. */
export const markSql = (rid: string, idx: number, where: PromoWhere): string =>
  `UPDATE yuplink.promo_redemption
      SET delivered = delivered || jsonb_build_object(${sqlStr(String(idx))}, ${sqlStr(where)})
    WHERE id = ${sqlStr(rid)};`;

/** Всё доехало — активация закрыта; повтор с другим ключом нажатия — «уже вводил». */
export const doneSql = (rid: string): string =>
  `UPDATE yuplink.promo_redemption SET status = 'done', done_at = now()
    WHERE id = ${sqlStr(rid)} AND status = 'reserved';`;
