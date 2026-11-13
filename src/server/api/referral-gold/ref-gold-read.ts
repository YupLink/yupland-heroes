// Экран «Друзья»: рефка золотом (ПРАВИЛА §8.101) — доля, сколько купили друзья,
// что придёт суточным начислением и сколько золота с друзей можно обменять на
// DARAI без лимита лицензии и до какого числа.
import { createServerFn } from "@tanstack/react-start";
import { getCurrentWallet } from "../../auth";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { accAccountId } from "../currency/move";
import { refPctFor } from "@/lib/referralGold";

export type RefGoldView = {
  /** Доля с покупок друзей сейчас, %. */
  pct: number;
  /** Сколько купили друзья, в золоте (подписка — $1 = 1 000). */
  friendsGold: number;
  /** Начислится в ближайшую полночь UTC. */
  pending: number;
  /** Всего получено с друзей (начислено). */
  earned: number;
  /** Можно обменять на DARAI без лимита лицензии. */
  swappable: number;
  /** До какого момента — ближайший срок (ISO) или null. */
  swapUntil: string | null;
};

export const EMPTY_REF_GOLD: RefGoldView = {
  pct: refPctFor(0),
  friendsGold: 0,
  pending: 0,
  earned: 0,
  swappable: 0,
  swapUntil: null,
};

export const getRefGold = createServerFn({ method: "GET" }).handler(
  async (): Promise<RefGoldView> => {
    const wallet = getCurrentWallet();
    const account = wallet ? await accAccountId(wallet) : null;
    if (!account) return EMPTY_REF_GOLD;
    const a = sqlStr(account);
    const rows = (await mcpExec(
      `SELECT (SELECT COALESCE(sum(gold), 0) FROM yuplink.ref_spend WHERE inviter_account = ${a})::text AS total,
            (SELECT COALESCE(sum(reward), 0) FROM yuplink.ref_spend
              WHERE inviter_account = ${a} AND paid_ref IS NULL)::text AS pending,
            (SELECT COALESCE(sum(reward), 0) FROM yuplink.ref_spend
              WHERE inviter_account = ${a} AND paid_ref IS NOT NULL)::text AS earned,
            (SELECT COALESCE(sum(left_amount), 0) FROM yuplink.ref_gold_right
              WHERE account_id = ${a} AND left_amount > 0 AND expires_at > now())::text AS swappable,
            (SELECT min(expires_at) FROM yuplink.ref_gold_right
              WHERE account_id = ${a} AND left_amount > 0 AND expires_at > now()) AS until`,
      { wrapJson: true },
    )) as Array<{
      total: string;
      pending: string;
      earned: string;
      swappable: string;
      until: string | null;
    }> | null;
    const r = rows?.[0];
    if (!r) return EMPTY_REF_GOLD;
    const total = Number(r.total) || 0;
    return {
      pct: refPctFor(total),
      friendsGold: total,
      pending: Number(r.pending) || 0,
      earned: Number(r.earned) || 0,
      swappable: Number(r.swappable) || 0,
      swapUntil: r.until ? String(r.until) : null,
    };
  },
);
